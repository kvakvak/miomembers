# MioMembers Discord server setup
# Requires DISCORD_BOT_TOKEN in .env

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
  return Invoke-RestMethod @params
}

Write-Host "Checking guild access..."
$botGuilds = @(Invoke-Discord GET "$Base/users/@me/guilds")
$guildInfo = $botGuilds | Where-Object { $_.id -eq $GuildId } | Select-Object -First 1
if (-not $guildInfo) { Write-Error "Bot is not in guild $GuildId. Add the bot first." }
Write-Host "Guild: $($guildInfo.name)"

Write-Host "Updating guild profile..."
try {
  Invoke-Discord PATCH "$Base/guilds/$GuildId" @{
    description = 'Official MioMembers community - Discord members and 24/7 VC bots. Order at miomembers.pages.dev'
  } | Out-Null
} catch {
  Write-Host "  Skipped guild description (optional)"
}

Write-Host "Fetching existing channels..."
$existing = @(Invoke-Discord GET "$Base/guilds/$GuildId/channels")

Write-Host "Creating roles..."
$customerRole = Invoke-Discord POST "$Base/guilds/$GuildId/roles" @{
  name = "Customer"
  color = 5763719
  hoist = $true
  mentionable = $false
}

$staffRole = Invoke-Discord POST "$Base/guilds/$GuildId/roles" @{
  name = "Staff"
  color = 10181046
  hoist = $true
  mentionable = $true
}

$everyoneDenySend = @(
  @{ id = $GuildId; type = 0; allow = "66560"; deny = "51264" }
)

$staffOnly = @(
  @{ id = $GuildId; type = 0; allow = "0"; deny = "1024" }
  @{ id = $staffRole.id; type = 0; allow = "3072"; deny = "0" }
)

function New-Category([string]$Name) {
  Invoke-Discord POST "$Base/guilds/$GuildId/channels" @{ name = $Name; type = 4 }
}

function New-TextChannel([string]$Name, [string]$CategoryId, [string]$Topic, [array]$Overwrites) {
  $body = @{ name = $Name; type = 0; parent_id = $CategoryId; topic = $Topic }
  if ($Overwrites) { $body.permission_overwrites = $Overwrites }
  Invoke-Discord POST "$Base/guilds/$GuildId/channels" $body
}

function New-VoiceChannel([string]$Name, [string]$CategoryId) {
  Invoke-Discord POST "$Base/guilds/$GuildId/channels" @{
    name = $Name; type = 2; parent_id = $CategoryId; user_limit = 0
  }
}

Write-Host "Creating categories and channels..."

$catInfo = New-Category "INFORMATION"
$catOrder = New-Category "ORDERS"
$catCommunity = New-Category "COMMUNITY"
$catVoice = New-Category "VOICE"
$catStaff = New-Category "STAFF"

$chWelcome = New-TextChannel "welcome" $catInfo.id "Start here - read before ordering" $everyoneDenySend
$chRules = New-TextChannel "rules" $catInfo.id "Server rules and terms" $everyoneDenySend
$chAnnounce = New-TextChannel "announcements" $catInfo.id "Updates, deals and service news" $everyoneDenySend
$chPricing = New-TextChannel "pricing" $catInfo.id '$0.03/member - $0.50/VC bot' $everyoneDenySend
$chHowTo = New-TextChannel "how-to-order" $catOrder.id "Step-by-step ordering guide"
$chSupport = New-TextChannel "support" $catOrder.id "Ask questions - staff will help"
$chGeneral = New-TextChannel "general" $catCommunity.id "Chat with the community"
$chShowcase = New-TextChannel "showcase" $catCommunity.id "Share your server growth wins"
$chLounge = New-VoiceChannel "Lounge" $catVoice.id
$chAfk = New-VoiceChannel "AFK" $catVoice.id
$chStaff = New-TextChannel "staff-chat" $catStaff.id "Staff only" $staffOnly
$chLogs = New-TextChannel "bot-logs" $catStaff.id "Automated logs" $staffOnly

Write-Host "Removing old default channels..."
foreach ($ch in $existing) {
  if ($ch.type -in 0, 2, 5) {
    try {
      Invoke-Discord DELETE "$Base/channels/$($ch.id)" | Out-Null
      Write-Host "  Deleted #$($ch.name)"
    } catch {
      Write-Host "  Skip #$($ch.name)"
    }
  }
}

$positions = @(
  @{ id = $catInfo.id; position = 0 }
  @{ id = $chWelcome.id; position = 1 }
  @{ id = $chRules.id; position = 2 }
  @{ id = $chAnnounce.id; position = 3 }
  @{ id = $chPricing.id; position = 4 }
  @{ id = $catOrder.id; position = 5 }
  @{ id = $chHowTo.id; position = 6 }
  @{ id = $chSupport.id; position = 7 }
  @{ id = $catCommunity.id; position = 8 }
  @{ id = $chGeneral.id; position = 9 }
  @{ id = $chShowcase.id; position = 10 }
  @{ id = $catVoice.id; position = 11 }
  @{ id = $chLounge.id; position = 12 }
  @{ id = $chAfk.id; position = 13 }
  @{ id = $catStaff.id; position = 14 }
  @{ id = $chStaff.id; position = 15 }
  @{ id = $chLogs.id; position = 16 }
)

Write-Host "Reordering channels..."
Invoke-Discord PATCH "$Base/guilds/$GuildId/channels" $positions | Out-Null

$rulesMention = "<#$($chRules.id)>"
$howToMention = "<#$($chHowTo.id)>"
$supportMention = "<#$($chSupport.id)>"

$welcomeDesc = @"
**Grow your server. Stay in voice 24/7.**

MioMembers delivers real Discord members and always-on VC bots at transparent rates.

**Members** - `$0.03 each (min. 100)
**VC AFK Bots** - `$0.50/bot/month

Read $rulesMention then head to $howToMention to place an order.
"@

$rulesDesc = @"
**1.** Be respectful - no spam or harassment
**2.** No chargebacks after delivery has started
**3.** Provide a valid server invite when ordering
**4.** Members are delivered gradually - do not panic
**5.** Open a ticket in $supportMention for order help

*By using our service you agree to Discord Terms of Service.*
"@

Write-Host "Posting welcome message..."
Invoke-Discord POST "$Base/channels/$($chWelcome.id)/messages" @{
  embeds = @(@{
    title = "Welcome to MioMembers"
    description = $welcomeDesc
    color = 5793266
    footer = @{ text = "MioMembers - Trusted Discord growth" }
  })
} | Out-Null

Invoke-Discord POST "$Base/channels/$($chRules.id)/messages" @{
  embeds = @(@{ title = "Server Rules"; description = $rulesDesc; color = 8166372 })
} | Out-Null

Invoke-Discord POST "$Base/channels/$($chPricing.id)/messages" @{
  embeds = @(@{
    title = "Pricing"
    color = 5793266
    fields = @(
      @{ name = "Discord Members"; value = "`$0.03 per member`nMin order: **100**"; inline = $true }
      @{ name = "VC AFK Bots"; value = "`$0.50 per bot / month`n24/7 voice uptime"; inline = $true }
      @{ name = "Order"; value = "Visit **miomembers.pages.dev** and log in with Discord"; inline = $false }
    )
  })
} | Out-Null

Write-Host "Done! Server setup complete."
