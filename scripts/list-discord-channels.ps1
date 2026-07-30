$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}
$Headers = @{
  Authorization = "Bot $($env:DISCORD_BOT_TOKEN)"
  "User-Agent" = "DiscordBot (miomembers, 1.0)"
}
$channels = Invoke-RestMethod -Headers $Headers -Uri "https://discord.com/api/v10/guilds/1531391518063984772/channels"
$channels | Where-Object { $_.type -eq 0 } | ForEach-Object {
  Write-Output "$($_.name) | id=$($_.id) | parent=$($_.parent_id)"
}
