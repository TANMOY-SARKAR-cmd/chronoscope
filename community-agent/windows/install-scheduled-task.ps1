param(
  [Parameter(Mandatory = $true)] [string] $NodePath,
  [Parameter(Mandatory = $true)] [string] $AgentPath,
  [Parameter(Mandatory = $true)] [string] $ConfigPath,
  [int] $EveryMinutes = 30
)

if ($EveryMinutes -lt 15) { throw "Use a cadence of at least 15 minutes." }
if (!(Test-Path $NodePath) -or !(Test-Path $AgentPath) -or !(Test-Path $ConfigPath)) { throw "Node, agent, or config path was not found." }

$taskName = "ChronoMesh Community Agent"
$action = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}" attest "{1}"' -f $AgentPath, $ConfigPath)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5)
$trigger.RepetitionInterval = (New-TimeSpan -Minutes $EveryMinutes)
$trigger.RepetitionDuration = (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Description "ChronoMesh signed NTP health evidence; probes only the configured source." -Force
Write-Host "Installed '$taskName' at a $EveryMinutes minute cadence. Keep config.json private."
