param([Parameter(Mandatory = $true)][string]$CacheDirectory)
$ErrorActionPreference = 'Stop'
$effectsCache = [System.IO.Path]::GetFullPath($CacheDirectory)
New-Item -ItemType Directory -Path $effectsCache -Force | Out-Null
Add-Type -AssemblyName System.Speech
$effectsSpeech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $effectsSpeech.SelectVoice('Microsoft Zira Desktop')
    $effectsSpeech.Rate = -2
    $effectsSpeech.SetOutputToWaveFile((Join-Path $effectsCache 'my-lord-raw.wav'))
    $effectsSpeech.Speak('My lord.')
} finally {
    $effectsSpeech.Dispose()
}
