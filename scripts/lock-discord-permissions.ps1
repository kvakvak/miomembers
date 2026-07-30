# Lock Discord channel permissions so members can only chat where allowed.
# Requires DISCORD_BOT_TOKEN in .env and the bot in the guild with Manage Channels.

param(
  [string]$GuildId = "1531391518063984772"
)

$ErrorActionPreference = "Stop"
$Base = "https://discord.com/api/v10"

$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
  }
}

$Token = $env:DISCORD_BOT_TOKEN
if (-not $Token) { Write-Error "Set DISCORD_BOT_TOKEN in .env first." }

$Headers = @{
  Authorization = "Bot $Token"
  "Content-Type" = "application/json"
  "User-Agent" = "DiscordBot (https://github.com/kvakvak/miomembers, 1.0)"
}

function Invoke-Discord {
  param([string]$Method, [string]$Uri, [object]$Body)
  $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers }
  if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
  try {
    return Invoke-RestMethod @params
  } catch {
    $detail = $_.ErrorDetails.Message
    if ($detail) { Write-Error "$Method $Uri failed: $detail" }
    throw $_
  }
}

# Discord permission bits (use string literals for API safety)
$ReadOnlyAllow = "66560"      # view + read history
$ReadOnlyDeny = "51264"       # send + react + attach + embed
$StaffDenyView = "1024"       # hide channel from @everyone
$StaffAllow = "118016"        # view + read + send + react + attach + embed
$ChatAllow = "118016"

$ReadOnlyChannels = @(
  "welcome", "rules", "announcements", "pricing"
)

$ChatChannels = @(
  "how-to-order", "support", "general", "showcase"
)

$StaffChannels = @(
  "staff-chat", "bot-logs"
)

Write-Host "Checking bot access..."
$botGuilds = @(Invoke-Discord GET "$Base/users/@me/guilds")
$guildInfo = $botGuilds | Where-Object { $_.id -eq $GuildId } | Select-Object -First 1
if (-not $guildInfo) { Write-Error "Bot is not in guild $GuildId. Invite it with Manage Channels permission." }
Write-Host "Guild: $($guildInfo.name)"

Write-Host "Fetching roles..."
$rawRoles = Invoke-Discord GET "$Base/guilds/$GuildId/roles"
$roles = @($rawRoles)
if ($roles.Count -eq 1 -and $roles[0] -is [System.Array]) {
  $roles = @($roles[0])
}
$staffRole = $roles | Where-Object { $_.name -eq "Staff" } | Select-Object -First 1
if (-not $staffRole) {
  Write-Host "Creating Staff role..."
  $staffRole = Invoke-Discord POST "$Base/guilds/$GuildId/roles" @{
    name = "Staff"
    color = 10181046
    hoist = $true
    mentionable = $true
  }
}

Write-Host "Fetching channels..."
$rawChannels = Invoke-Discord GET "$Base/guilds/$GuildId/channels"
$channels = @($rawChannels)
if ($channels.Count -eq 1 -and $channels[0] -is [System.Array]) {
  $channels = @($channels[0])
}
Write-Host "Found $($channels.Count) channels"

function Set-ChannelPermissions {
  param(
    [object]$Channel,
    [array]$Overwrites
  )

  Write-Host "  #$($Channel.name) -> updating permissions"
  $payloadOverwrites = New-Object System.Collections.Generic.List[object]
  foreach ($overwrite in $Overwrites) {
    $payloadOverwrites.Add([ordered]@{
      id = [string]$overwrite.id
      type = [int]$overwrite.type
      allow = [string]$overwrite.allow
      deny = [string]$overwrite.deny
    })
  }

  $json = (@{ permission_overwrites = $payloadOverwrites.ToArray() } | ConvertTo-Json -Depth 10 -Compress)
  try {
    Invoke-RestMethod -Method PATCH -Uri "$Base/channels/$([string]$Channel.id)" -Headers $Headers -Body $json | Out-Null
  } catch {
    Write-Error "PATCH channels/$($Channel.id) failed: $($_.ErrorDetails.Message)`nBody: $json"
  }
}

$updated = 0
foreach ($ch in $channels) {
  $channelType = if ($null -ne $ch.type) { [int]$ch.type } else { -1 }
  if ($channelType -ne 0) { continue }

  if ($ReadOnlyChannels -contains $ch.name) {
    Set-ChannelPermissions $ch @(
      @{ id = [string]$GuildId; type = 0; allow = $ReadOnlyAllow; deny = $ReadOnlyDeny }
      @{ id = [string]$staffRole.id; type = 0; allow = $StaffAllow; deny = "0" }
    )
    $updated++
    continue
  }

  if ($StaffChannels -contains $ch.name) {
    Set-ChannelPermissions $ch @(
      @{ id = [string]$GuildId; type = 0; allow = "0"; deny = $StaffDenyView }
      @{ id = [string]$staffRole.id; type = 0; allow = $StaffAllow; deny = "0" }
    )
    $updated++
    continue
  }

  if ($ChatChannels -contains $ch.name) {
    Set-ChannelPermissions $ch @(
      @{ id = [string]$GuildId; type = 0; allow = $ChatAllow; deny = "0" }
    )
    $updated++
  }
}

if ($updated -eq 0) {
  Write-Warning "No matching text channels were updated. Check channel names in the server."
}

Write-Host "Done. Updated $updated channel(s)."
