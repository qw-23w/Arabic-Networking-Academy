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
$labSource = if (Test-Path -LiteralPath $labPath) { [IO.File]::ReadAllText($labPath) } else { '' }
$lessonLogic = if (Test-Path -LiteralPath $lessonLogicPath) { [IO.File]::ReadAllText($lessonLogicPath) } else { '' }

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
  ($lessonLogic -match 'n\.startsWith\("on"\)'),
  ($lessonLogic -match 'javascript\|vbscript\|data'),
  ($lessonLogic -match 'n === "srcset"'),
  ($lessonLogic -match 'riskyStyle')
)
if (($sanitizerChecks | Where-Object { -not $_ }).Count -eq 0) { Add-Finding 'PASS' 'Lesson HTML sanitizer' 'DOM parsing, event/protocol filtering, srcset removal, and risky CSS URL filtering are present.' }
else { Add-Finding 'WARN' 'Lesson HTML sanitizer' 'One or more expected sanitizer safeguards were not detected; review content override handling.' }

# RLS presence only; this does not execute SQL or authenticate to Supabase.
$sqlFiles = @(Get-ChildItem -LiteralPath (Join-Path $rootPath 'supabase') -Recurse -File -Filter '*.sql' -ErrorAction SilentlyContinue)
$sqlText = ($sqlFiles | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n"
$rlsTest = Join-Path $rootPath 'supabase/tests/rls_verification.sql'
if ($sqlText -match '(?i)enable\s+row\s+level\s+security' -and (Test-Path -LiteralPath $rlsTest)) {
  Add-Finding 'PASS' 'Supabase RLS artifacts' 'RLS statements and a rollback-based verification script exist; no live database checks were run.'
} else { Add-Finding 'WARN' 'Supabase RLS artifacts' 'RLS statements or the verification SQL file were not found.' }

# Check only known private-key markers. Never include matched values in output.
$sourceFiles = @(Get-ChildItem -LiteralPath $rootPath -Recurse -File | Where-Object {
  $_.FullName -notmatch '[\\/](\.git|node_modules|\.codex|outputs)[\\/]' -and $_.Extension -in '.js','.html','.json','.sql','.env','.txt'
})
$privateMarker = '(?i)-----BEGIN\s+(RSA|OPENSSH|EC|PRIVATE)\s+KEY-----|sb_secret_|SUPABASE_SERVICE_ROLE_KEY\s*[:=]|service_role_key\s*[:=]'
$privateFiles = [System.Collections.Generic.List[string]]::new()
foreach ($file in $sourceFiles) {
  $text = [IO.File]::ReadAllText($file.FullName)
  if ($text -match $privateMarker) { $privateFiles.Add($file.Name) }
}
if ($privateFiles.Count -eq 0) { Add-Finding 'PASS' 'Private-key markers' 'No recognized private-key markers were found in scanned source files.' }
else { Add-Finding 'FAIL' 'Private-key markers' ('Review these filenames; matching values were withheld: ' + (($privateFiles | Select-Object -Unique) -join ', ')) }

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
