[CmdletBinding()]
param(
  [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$script:Findings = [System.Collections.Generic.List[object]]::new()

function Add-Finding {
  param([string]$Status, [string]$Check, [string]$Details)
  $script:Findings.Add([pscustomobject]@{ Status = $Status; Check = $Check; Details = $Details })
}

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  throw "Project folder not found: $Root"
}

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$labPath = Join-Path $rootPath 'assets/js/lab.js'
$lessonLogicPath = Join-Path $rootPath 'assets/js/lesson.js'
$appPath = Join-Path $rootPath 'assets/js/app.js'
$labSource = if (Test-Path -LiteralPath $labPath) { [IO.File]::ReadAllText($labPath) } else { '' }
$lessonLogic = if (Test-Path -LiteralPath $lessonLogicPath) { [IO.File]::ReadAllText($lessonLogicPath) } else { '' }
$appSource = if (Test-Path -LiteralPath $appPath) { [IO.File]::ReadAllText($appPath) } else { '' }

# Lesson coverage and ID mapping.
$lessons = @(Get-ChildItem -LiteralPath $rootPath -File -Filter 'lesson-*.html' | Where-Object { $_.Name -match '^lesson-[1-9]\.html$' })
if ($lessons.Count -eq 9) { Add-Finding 'PASS' 'Lesson pages' 'Found all nine lesson pages.' }
else { Add-Finding 'FAIL' 'Lesson pages' "Expected nine lesson pages; found $($lessons.Count)." }

$idErrors = [System.Collections.Generic.List[string]]::new()
foreach ($file in $lessons) {
  $expected = [int]([regex]::Match($file.Name, '^lesson-(\d)\.html$').Groups[1].Value)
  $html = [IO.File]::ReadAllText($file.FullName)
  $id = [regex]::Match($html, '\bLESSON_ID\s*=\s*(\d+)')
  if (-not $id.Success -or [int]$id.Groups[1].Value -ne $expected) { $idErrors.Add($file.Name) }
  if ($html -notmatch 'QUESTIONS\s*=\s*\[') { $idErrors.Add("$($file.Name) (quiz questions missing)") }
}
if ($idErrors.Count -eq 0 -and $lessons.Count -eq 9) { Add-Finding 'PASS' 'Lesson IDs and quizzes' 'Each lesson ID matches its filename and defines quiz questions.' }
else { Add-Finding 'FAIL' 'Lesson IDs and quizzes' ('Check: ' + ($idErrors -join ', ')) }

# Answer keys must stay server-side, and authenticated clients may submit choices only.
$quizFixPath = Join-Path $rootPath 'supabase/migrations/20261101000200_server_grade_quizzes_and_rate_limit_visits.sql'
$quizFix = if (Test-Path -LiteralPath $quizFixPath) { [IO.File]::ReadAllText($quizFixPath) } else { '' }
$learningPath = Join-Path $rootPath 'my-learning.html'
$learningSource = if (Test-Path -LiteralPath $learningPath) { [IO.File]::ReadAllText($learningPath) } else { '' }
$quizSecurityErrors = [System.Collections.Generic.List[string]]::new()
foreach ($file in $lessons) {
  $lessonId = [int]([regex]::Match($file.Name, '^lesson-(\d)\.html$').Groups[1].Value)
  $html = [IO.File]::ReadAllText($file.FullName)
  $block = [regex]::Match($html, '(?s)const QUESTIONS\s*=\s*\[(.*?)\];')
  if (-not $block.Success) { $quizSecurityErrors.Add($file.Name); continue }
  $questionCount = [regex]::Matches($block.Groups[1].Value, '(?:\{|,)\s*(?:"q"|q)\s*:').Count
  $clientAnswerKey = [regex]::IsMatch($block.Groups[1].Value, '(?:"a"|''a''|\ba)\s*:')
  if ($clientAnswerKey -or $questionCount -lt 5) { $quizSecurityErrors.Add($file.Name) }
}
$secureQuizClient = $lessonLogic -match 'sb\.rpc\("submit_quiz_answers"' -and $lessonLogic -notmatch 'from\("quiz_results"\)\.insert'
$secureQuizMigration = $quizFix -match '(?is)create\s+table\s+if\s+not\s+exists\s+public\.quiz_answer_keys' -and
  $quizFix -match '(?is)select\s+k\.answers\s+into\s+answer_key.*?from\s+public\.quiz_answer_keys' -and
  $quizFix -match '(?is)create\s+or\s+replace\s+function\s+public\.submit_quiz_answers' -and
  $quizFix -match '(?is)auth\.uid\(\)\s+is\s+null.*?authentication required' -and
  $quizFix -match '(?is)revoke\s+all\s+on\s+public\.quiz_results.*?drop\s+policy\s+if\s+exists\s+quiz_insert_own' -and
  $quizFix -notmatch '(?is)when\s+[1-9]\s+then\s+array\s*\['
$verifiedHistory = $learningSource -match 'grading_source.*server-rpc'
if ($quizSecurityErrors.Count -eq 0 -and $secureQuizClient -and $secureQuizMigration -and $verifiedHistory) {
  Add-Finding 'PASS' 'Server-graded quizzes' 'Correct answers are absent from the public site and migrations; a private answer-key table feeds the grader, and direct client inserts are revoked.'
} else { Add-Finding 'FAIL' 'Server-graded quizzes' ('Review the lesson answer keys, RPC permissions, or history filter: ' + ($quizSecurityErrors -join ', ')) }

# Anonymous visit tracking uses a short-lived IP digest quota in addition to the replaceable browser token.
$visitThrottle = $quizFix -match '(?is)create\s+table\s+if\s+not\s+exists\s+public\.page_visit_rate_limits' -and
  $quizFix -match '(?is)x-forwarded-for' -and $quizFix -match '(?is)sha256\(' -and
  $quizFix -match '(?is)hit_count\s*>\s*1200' -and
  $quizFix -match '(?is)revoke\s+all\s+on\s+public\.page_visit_rate_limits'
if ($visitThrottle) { Add-Finding 'PASS' 'Visit throttling' 'A 1,200-per-hour hashed-IP limit supplements browser-token deduplication; raw addresses are not stored.' }
else { Add-Finding 'FAIL' 'Visit throttling' 'Review the request-header rate limit and private table grants in the latest migration.' }

# The lab must include one well-formed, topic-specific assessment per lesson.
$assessmentBlock = [regex]::Match($labSource, '(?sm)const ASSESSMENTS\s*=\s*\{(.*?)^\s*\};')
$assessmentErrors = [System.Collections.Generic.List[string]]::new()
$assessmentIds = [System.Collections.Generic.HashSet[int]]::new()
if ($assessmentBlock.Success) {
  $pattern = '(?ms)^\s*(?<id>[1-9]):\s*\{\s*q:\s*"(?<q>(?:\\.|[^"\\])*)",\s*o:\s*\[(?<options>.*?)\],\s*a:\s*(?<answer>\d+),\s*why:\s*"(?<why>(?:\\.|[^"\\])*)"\s*\}'
  foreach ($entry in [regex]::Matches($assessmentBlock.Groups[1].Value, $pattern)) {
    $id = [int]$entry.Groups['id'].Value
    [void]$assessmentIds.Add($id)
    $options = [regex]::Matches($entry.Groups['options'].Value, '"(?:\\.|[^"\\])*"').Count
    $answer = [int]$entry.Groups['answer'].Value
    if ([string]::IsNullOrWhiteSpace($entry.Groups['q'].Value) -or [string]::IsNullOrWhiteSpace($entry.Groups['why'].Value) -or $options -lt 3 -or $answer -ge $options) {
      $assessmentErrors.Add("lesson $id")
    }
  }
}
if ($assessmentIds.Count -eq 9 -and $assessmentErrors.Count -eq 0) { Add-Finding 'PASS' 'Lab comprehension checks' 'All nine labs have a question, three or more options, a valid answer, and feedback.' }
else { Add-Finding 'FAIL' 'Lab comprehension checks' ("Found $($assessmentIds.Count) question records; malformed: " + ($assessmentErrors -join ', ')) }

if ($labSource -match 'ana_lab_v2_' -and $labSource -match 'Number\(t\.dataset\.answer\)\s*===\s*check\.a' -and $labSource -match 'hooks\.onGoal\(\)') {
  Add-Finding 'PASS' 'Completion gate' 'Mission completion follows a correct lesson-specific answer; prior local completion flags are versioned out.'
} else { Add-Finding 'FAIL' 'Completion gate' 'Review the lab answer check and its completion callback.' }

if ($labSource -match 'tabindex="0"\s+role="button"' -and $labSource -match 'svg\.addEventListener\("keydown"' -and $labSource -match 'ArrowUp') {
  Add-Finding 'PASS' 'Keyboard lab controls' 'Simulator devices can be focused, selected, linked, and moved with the keyboard.'
} else { Add-Finding 'WARN' 'Keyboard lab controls' 'Review keyboard access to interactive simulator devices.' }
if ($labSource -match 'aria-modal' -and $labSource -match 'ov\.addEventListener\("keydown"' -and $labSource -match 'e\.key !== "Tab"') {
  Add-Finding 'PASS' 'Dialog focus handling' 'The lab dialog returns focus to its opener and traps Tab navigation while open.'
} else { Add-Finding 'WARN' 'Dialog focus handling' 'Review keyboard focus entry, containment, and return for the lab dialog.' }
if ($labSource -match 'prefers-reduced-motion: reduce') { Add-Finding 'PASS' 'Reduced motion' 'Packet animation duration follows the operating-system reduced-motion preference.' }
else { Add-Finding 'WARN' 'Reduced motion' 'Review animated feedback for reduced-motion preferences.' }

# Defense-in-depth checks for database-authored lesson HTML.
$sanitizerChecks = @(
  ($lessonLogic -match 'DOMParser'),
  ($lessonLogic -match 'const HTML_TAGS'),
  ($lessonLogic -match 'const SVG_TAGS'),
  ($lessonLogic -match 'function copyNode'),
  ($lessonLogic -match 'safeHref'),
  ($lessonLogic -match 'safeImage'),
  ($lessonLogic -match 'safeSvgValue'),
  ($lessonLogic -match 'createElementNS\(SVG_NS')
)
if (($sanitizerChecks | Where-Object { -not $_ }).Count -eq 0) { Add-Finding 'PASS' 'Lesson HTML sanitizer' 'Sanitized content is rebuilt using explicit HTML/SVG tag and attribute allowlists; unsafe namespaces, styles, and URL schemes are not copied.' }
else { Add-Finding 'WARN' 'Lesson HTML sanitizer' 'One or more expected sanitizer safeguards were not detected; review content override handling.' }

# RLS presence only; this does not execute SQL or authenticate to Supabase.
$sqlFiles = @(Get-ChildItem -LiteralPath (Join-Path $rootPath 'supabase') -Recurse -File -Filter '*.sql' -ErrorAction SilentlyContinue)
$sqlText = ($sqlFiles | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n"
$rlsTest = Join-Path $rootPath 'supabase/tests/rls_verification.sql'
if ($sqlText -match '(?i)enable\s+row\s+level\s+security' -and (Test-Path -LiteralPath $rlsTest)) {
  Add-Finding 'PASS' 'Supabase RLS artifacts' 'RLS statements and a rollback-based verification script exist; no live database checks were run.'
} else { Add-Finding 'WARN' 'Supabase RLS artifacts' 'RLS statements or the verification SQL file were not found.' }

# Ensure the consolidated schema, original migration, and deployment migration stay aligned.
$shareSourcePaths = @(
  'supabase/schema.sql',
  'supabase/migrations/20261017000100_admin_share_links.sql',
  'supabase/migrations/20261101000100_harden_share_analytics.sql'
)
$shareSourceErrors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $shareSourcePaths) {
  $path = Join-Path $rootPath $relativePath
  $source = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
  $tokenLengthBound = $source -match 'char_length\(t\)\s*<>\s*64'
  $tokenFormatBound = $source.Contains('t !~ ''^[0-9a-f]{64}$''')
  $daysBound = $source -match 'least\(greatest\(coalesce\(days,\s*30\),\s*1\),\s*366\)'
  if (-not ($tokenLengthBound -and $tokenFormatBound -and $daysBound)) { $shareSourceErrors.Add($relativePath) }
}
$shareFixPath = Join-Path $rootPath 'supabase/migrations/20261101000100_harden_share_analytics.sql'
$shareFix = if (Test-Path -LiteralPath $shareFixPath) { [IO.File]::ReadAllText($shareFixPath) } else { '' }
$shareGrantCheck = $shareFix -match '(?is)revoke\s+all\s+on\s+function\s+public\.share_registrations_by_day\(text,\s*int\).*?grant\s+execute\s+on\s+function\s+public\.share_registrations_by_day\(text,\s*int\)\s+to\s+anon,\s*authenticated'
if ($shareSourceErrors.Count -eq 0 -and $shareGrantCheck) {
  Add-Finding 'PASS' 'Share analytics bounds' 'Malformed tokens are rejected before hashing and date-series requests are capped at 366 days; explicit RPC grants are present.'
} else { Add-Finding 'FAIL' 'Share analytics bounds' ('Review token validation, date bounds, or grants in: ' + ($shareSourceErrors -join ', ')) }

# Pin the browser SDK to a complete version instead of following a moving major-version alias.
$htmlFiles = @(Get-ChildItem -LiteralPath $rootPath -File -Filter '*.html')
$htmlText = ($htmlFiles | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n"
$sdkRefs = [regex]::Matches($htmlText, 'https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@').Count
$pinnedSdkRefs = [regex]::Matches($htmlText, 'https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@\d+\.\d+\.\d+').Count
$movingSdkRefs = [regex]::Matches($htmlText, 'https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@(?:latest|next|\d+)(?:["/])').Count
if ($sdkRefs -gt 0 -and $pinnedSdkRefs -eq $sdkRefs -and $movingSdkRefs -eq 0) {
  Add-Finding 'PASS' 'Pinned Supabase SDK' "All $sdkRefs Supabase SDK script references use an exact semantic version."
} else { Add-Finding 'FAIL' 'Pinned Supabase SDK' 'Review Supabase SDK script references; every CDN reference must use an exact semantic version.' }

# Check only known private-key markers. Never include matched values in output.
$sourceFiles = @(Get-ChildItem -LiteralPath $rootPath -Recurse -File | Where-Object {
  $_.FullName -notmatch '[\\/](\.git|node_modules|\.codex|outputs)[\\/]' -and $_.Extension -in '.js','.html','.json','.sql','.env','.txt','.md','.yml','.yaml','.toml'
})
$privateMarker = '(?i)-----BEGIN\s+(RSA|OPENSSH|EC|PRIVATE)\s+KEY-----|sb_secret_|SUPABASE_SERVICE_ROLE_KEY\s*[:=]|service_role_key\s*[:=]'
$privateFiles = [System.Collections.Generic.List[string]]::new()
foreach ($file in $sourceFiles) {
  $text = [IO.File]::ReadAllText($file.FullName)
  if ($text -match $privateMarker) { $privateFiles.Add($file.Name) }
}
if ($privateFiles.Count -eq 0) { Add-Finding 'PASS' 'Private-key markers' 'No recognized private-key markers were found in scanned source files.' }
else { Add-Finding 'FAIL' 'Private-key markers' ('Review these filenames; matching values were withheld: ' + (($privateFiles | Select-Object -Unique) -join ', ')) }

# The post-login return destination must remain on this site and match a protected page filename.
$safeReturnPath = $appSource.Contains('new URL(n, appRoot)') -and
  $appSource.Contains('target.origin !== appRoot.origin') -and
  $appSource.Contains('admin|my-learning|lesson-[1-9]')
if ($safeReturnPath) { Add-Finding 'PASS' 'Post-login redirect guard' 'Stored return paths are restricted to same-origin protected lesson/account pages.' }
else { Add-Finding 'FAIL' 'Post-login redirect guard' 'Review the stored post-login destination validation in assets/js/app.js.' }

# Keep source, database, and review artifacts out of the Jekyll-built public Pages artifact.
$pagesConfigPath = Join-Path $rootPath '_config.yml'
$pagesConfig = if (Test-Path -LiteralPath $pagesConfigPath) { [IO.File]::ReadAllText($pagesConfigPath) } else { '' }
$pagesExcludes = $pagesConfig -match '(?m)^\s*-\s*supabase/' -and $pagesConfig -match '(?m)^\s*-\s*tools/'
if ($pagesExcludes) { Add-Finding 'PASS' 'Pages artifact exclusions' 'Jekyll excludes the Supabase and tools directories from the public Pages build.' }
else { Add-Finding 'FAIL' 'Pages artifact exclusions' 'Add Jekyll exclude rules for the private-operational source directories.' }

# Heuristic only: innerHTML is not automatically unsafe, but its inputs must stay escaped or sanitized.
$sinkCount = [regex]::Matches($labSource + $lessonLogic, '\.innerHTML\s*=').Count
if ($sinkCount -gt 0) { Add-Finding 'WARN' 'HTML injection sinks' "$sinkCount innerHTML assignments found in the lab/lesson logic; manually verify dynamic values remain escaped or sanitized." }
else { Add-Finding 'PASS' 'HTML injection sinks' 'No innerHTML assignments found in the lab/lesson logic.' }

$headerFiles = @('_headers','netlify.toml','vercel.json') | Where-Object { Test-Path -LiteralPath (Join-Path $rootPath $_) }
if ($headerFiles.Count -gt 0) { Add-Finding 'INFO' 'Deployment headers' ('Found provider header configuration: ' + ($headerFiles -join ', ') + '. Verify it matches the actual host.') }
else { Add-Finding 'WARN' 'Deployment headers' 'No deployment header configuration found in the project root; configure CSP/frame/referrer/transport headers at the chosen host.' }

Write-Output "Static review for: $rootPath"
Write-Output 'No network requests, endpoint probes, or active attacks are performed by this script.'
$script:Findings | Format-Table -AutoSize | Out-String -Width 180 | Write-Output
$failureCount = @($script:Findings | Where-Object Status -eq 'FAIL').Count
$warningCount = @($script:Findings | Where-Object Status -eq 'WARN').Count
Write-Output "Summary: $failureCount failure(s), $warningCount warning(s), $($script:Findings.Count) checks."
if ($failureCount -gt 0) { exit 1 }
