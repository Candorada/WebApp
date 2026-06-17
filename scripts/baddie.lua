if not game:IsLoaded() then game.Loaded:Wait() end
if game.PlaceId ~= 79305036070450 then return end

local root = "https://raw.githubusercontent.com/Candorada/r/refs/heads/main/"
local TeleportService = game:GetService("TeleportService")
function tp(place,job,plr)
    local success, errorMessage,rv = pcall(function()
        return TeleportService:TeleportToPlaceInstance(place, job , plr)
    end)
    return success;
end

getgenv().isTeleporting = getgenv().isTeleporting and true or false
local randomRejoin;randomRejoin=function()
    if(getgenv().isTeleporting) then return end 
    getgenv().isTeleporting = true
    local p = game:GetService("Players").LocalPlayer
    local to = Instance.new("TeleportOptions")

    local http = game:GetService("HttpService")
    local headers = {
        ["Content-Type"] = "application/json"
    }
    local data = {
        ["content"] = message
    }
    local body = http:JSONEncode(data)
    local url = "https://games.roblox.com/v1/games/"..tostring(game.PlaceId).."/servers/Public?sortOrder=Asc&limit=100"
    local response = request({
        Url = url,
        Method = "GET",
        Headers = headers,
        Body = body
    })
    local connect;
    connect = TeleportService.TeleportInitFailed:Connect(function(player, result, errorMessage, placeId, jobId)
        getgenv().isTeleporting = false
        connect:Disconnect()
        task.wait(1)
        randomRejoin()
    end)
    local json;
    if response.Success then
        writefile("baddieWebRequestLoggs.json",response.Body)
        json = http:JSONDecode(response.Body)
    else
        json = http:JSONDecode(readfile("baddieWebRequestLoggs.json"))
    end
    local data = json.data
    if #data == 0 then
        TeleportService:Teleport(game.PlaceId)
    else
        local id = data[math.ceil(math.random()*#data)].id
        if not tp(game.PlaceId,id , p) then
            randomRejoin()
        end
    end
    --connect:Disconnect()
    --https://games.roblox.com/v1/games/79305036070450/servers/Public?sortOrder=Desc&limit=100
end

if getgenv().antiKick then getgenv().antiKick:Disconnect(); getgenv().antiKick=nil end
getgenv().antiKick = game.CoreGui.RobloxPromptGui.promptOverlay.ChildAdded:Connect(function(c)
    if(c.Name == "ErrorPrompt" and not getgenv().isTeleporting) then
        getgenv().antiKick:Disconnect(); getgenv().antiKick=nil
        randomRejoin()
    end
end)
local http = game:GetService("HttpService") --just using this because httpGet Is Bullying me
local data = request({Url="https://raw.githubusercontent.com/discoart/FluentPlus/refs/heads/main/release.lua"}).Body
local Fluent, SaveManager, InterfaceManager = loadstring(data)()
--https://forgenet.gitbook.io/fluent-documentation/documentation/documentation/fluent
getgenv().loadedBaddieScript = false
getgenv().pauseAutoRejoin = false
-- Addons:
-- SaveManager (Allows you to have a configuration system)
-- InterfaceManager (Allows you to have a interface managment system)

-- Hand the library over to our managers
SaveManager:SetLibrary(Fluent)
InterfaceManager:SetLibrary(Fluent)

-- Ignore keys that are used by ThemeManager.
-- (we dont want configs to save themes, do we?)
--SaveManager:IgnoreThemeSettings()

-- You can add indexes of elements the save manager should ignore
SaveManager:SetIgnoreIndexes({"Fly"})

if getgenv().fluentUI then
	getgenv().fluentUI:Destroy()
end
getgenv().fluentUI = Fluent
Fluent.GUI.Parent = workspace.Parent.CoreGui
Fluent.GUI.Name = "FluentGui"
local Window = Fluent:CreateWindow({
    Title = "BaddieUI",
    SubTitle = "made using Fluent v"..Fluent.Version.." by dawid",
    Search = true, -- optional and default true
    Icon = "home", -- optional
    TabWidth = 160,
    Size = UDim2.fromOffset(580, 460),
    Acrylic = true, -- The blur may be detectable, setting this to false disables blur entirely
    Theme = "Dark",
    MinimizeKey = Enum.KeyCode.LeftControl, -- Used when theres no MinimizeKeybind

    UserInfo = true,
    UserInfoTop = false, -- display user info at the top of the window
    UserInfoTitle = game:GetService("Players").LocalPlayer.DisplayName,
    UserInfoSubtitle = "User",
    UserInfoSubtitleColor = Color3.fromRGB(71, 123, 255)
})
Fluent.Window.Root.Active = true
local Tabs = {
    Main = Window:AddTab({ Title = "Main", Icon = "" }),
	Mobility = Window:AddTab({ Title = "Mobility", Icon = "move" }),
    Settings = Window:AddTab({ Title = "Settings", Icon = "settings" })
}
local Options = Fluent.Options


-- use case for doing it this way:
-- a script hub could have themes in a global folder
-- and game configs in a separate folder per game
InterfaceManager:SetFolder("FluentScriptHub")
SaveManager:SetFolder("FluentScriptHub/Baddie".. game:GetService("Players").LocalPlayer.UserId)

InterfaceManager:BuildInterfaceSection(Tabs.Settings)
SaveManager:BuildConfigSection(Tabs.Settings)

if(isfile(SaveManager.Folder.."/autoload.txt")) then
    local name = readfile(SaveManager.Folder .. "/autoload.txt")
    SaveManager.Options.SaveManager_ConfigList:SetValue(name)
    SaveManager.Options.SaveManager_ConfigName:SetValue(name)
end--sets name and configlist stats correctly

--Start of real script

function buyEgg(name,count)
    -- This script was generated by Hydroxide's RemoteSpy: https://github.com/Upbolt/Hydroxide
    local ohString1 = name
    local ohNumber2 = count
    game:GetService("ReplicatedStorage").Events.RegularPet:InvokeServer(ohString1, ohNumber2)
end

function buyAll()
    repeat task.wait() until game:GetService("Players").LocalPlayer
    local s = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("Main"):WaitForChild("RestockScript")
    local senv = getsenv(s)
    repeat task.wait() until senv._G.Profile
    for i,v in pairs(senv._G.Profile.Data.dice_stock) do
        if v>0 then
            print(i, v, "dice")
            game:GetService("ReplicatedStorage").Events.buy:InvokeServer(i, v, "dice")
        end
    end
    task.wait()
    for i,v in pairs(senv._G.Profile.Data.potion_stock) do 
        if v>0 then
            print(i, v, "potion")
            game:GetService("ReplicatedStorage").Events.buy:InvokeServer(i, v, "potion")
        end
    end
end

function nullityExists() 
    --alternative, game:GetService("ReplicatedStorage").status.nullity_active
    return #game.Workspace:QueryDescendants("#Nullity") >= 1 and true or false
end


local function lerp(a, b, t)
	return a + (b - a) * t
end
local function lerpColor3(c1, c2, t)
	return Color3.new(
		lerp(c1.R, c2.R, t),
		lerp(c1.G, c2.G, t),
		lerp(c1.B, c2.B, t)
	)
end
local function colorAt(sequence: ColorSequence, t: number): Color3
	-- clamps t to [0,1]
	if t <= 0 then
		return sequence.Keypoints[1].Value
	end
	if t >= 1 then
		return sequence.Keypoints[#sequence.Keypoints].Value
	end

	local kps = sequence.Keypoints
	for i = 1, #kps - 1 do
		local a = kps[i]
		local b = kps[i + 1]
		if t >= a.Time and t <= b.Time then
			local span = (b.Time - a.Time)
			local alpha = (span == 0) and 0 or (t - a.Time) / span
			return lerpColor3(a.Value, b.Value, alpha)
		end
	end

	-- fallback (shouldn't happen if keypoints are valid)
	return kps[#kps].Value
end
local function escapeRichText(s: string): string
	-- Prevent RichText breaking on special characters
	return (s
		:gsub("&", "&amp;")
		:gsub("<", "&lt;")
		:gsub(">", "&gt;")
		:gsub('"', "&quot;")
		:gsub("'", "&apos;")
	)
end
function GradientFromColorSequence(text: string, sequence: ColorSequence): string
	local n = #text
	if n == 0 then return "" end

	-- avoid division by zero for 1-char strings
	local denom = (n > 1) and (n - 1) or 1

	local out = table.create(n)
	for i = 1, n do
		local ch = escapeRichText(text:sub(i, i))
		local t = (i - 1) / denom

		local c = colorAt(sequence, t)
		local r = math.floor(c.R * 255 + 0.5)
		local g = math.floor(c.G * 255 + 0.5)
		local b = math.floor(c.B * 255 + 0.5)

		out[i] = string.format('<font color="rgb(%d,%d,%d)">%s</font>', r, g, b, ch)
	end

	return table.concat(out)
end


function getWeather()
    local events,colors = getEvents()
    local weather = game:GetService("ReplicatedStorage"):WaitForChild("status"):GetAttribute("event")
    local cont = game:GetService("Players").LocalPlayer.PlayerGui:WaitForChild("Main"):WaitForChild("WeatherContainer")
    local title = cont:WaitForChild("Frame"):WaitForChild("Title")
    local r = (weather ~="" and colors[weather] ~=nil) and {weather, GradientFromColorSequence(weather,colors[weather])} or {nil, ""}
    return r[1],r[2]
end
function setConveyer(b)
    for i,v in pairs(workspace:QueryDescendants("#Conveyor Part")) do
        v.CanCollide = b
    end
end
function getChar()
	return game:GetService("Players").LocalPlayer.Character
end
function getEggs()
    local RS = game:GetService("ReplicatedStorage")
    local Modules = RS:WaitForChild("Modules")
    local PetConfig = Modules:WaitForChild("PetConfig")
    local EggDataModule = PetConfig:WaitForChild("EggData")
    local EggData = require(EggDataModule)
    local Eggs = {}
    local Prices = {}
    for i,v in pairs(EggData) do
        Eggs[#Eggs+1] = i
        Prices[i] = v.Price
    end
    return Eggs,Prices
end
function getRoot()
	local char = getChar()
	if char and char.Humanoid then
		return char.Humanoid.RootPart
	end
	return nil
end

-- [[[[[[[[[[Mobility Section]]]]]]]]]]



local Section = Tabs.Mobility:AddSection("Flight", "wind") -- Create section with icon
local Toggle = Section:AddToggle("Fly", {Title = "Toggle Flight",Description = "Toggle Flight", Default = false })
Toggle:OnChanged(function()
	getgenv().Fly = Options.Fly.Value
	if Options.Fly.Value then
		
		if(workspace.Gravity ~= 0) then
			getgenv().g = workspace.Gravity
		end
		workspace.Gravity = 0
		if getChar() and getChar().Humanoid then
			getChar().Humanoid.PlatformStand = true
		end
		local lastRun = time()
		while task.wait() and getgenv().Fly do
			local sinceLast = time()-lastRun
			lastRun = time()
			local pressed = game:GetService("UserInputService"):GetKeysPressed()
			local isWDown = false
			local isADown = false
			local isSDown = false
			local isDDown = false
			for _, key in ipairs(pressed) do
				if key.KeyCode == Enum.KeyCode.W then
					isWDown = true
				elseif key.KeyCode == Enum.KeyCode.A then
					isADown = true
				elseif key.KeyCode == Enum.KeyCode.S then
					isSDown = true
				elseif key.KeyCode == Enum.KeyCode.D then
					isDDown = true
				end
			end
			local vector = (isWDown and Vector2.new(-1,0) or Vector2.zero)+
							(isADown and Vector2.new(0,-1) or Vector2.zero)+
							(isSDown and Vector2.new(1,0) or Vector2.zero)+
							(isDDown and Vector2.new(0,1) or Vector2.zero)
			local keybindVector = vector.Unit.Magnitude == vector.Unit.Magnitude and vector.Unit or Vector3.zero
			keybindVector = Vector3.new(keybindVector.Y, 0, keybindVector.X)
			vector = Vector3.new(vector.Y,0,vector.X).Unit*sinceLast*Options.FlySpeed.Value/0.745
			local root = getRoot()
			if root ~= nil then
				--root.CFrame = root.CFrame*CFrame.new(vector.Magnitude == vector.Magnitude and vector or Vector3.zero) --tp method 
				root.CFrame = CFrame.new(root.Position)*workspace.CurrentCamera.CFrame.Rotation
				root.AssemblyLinearVelocity = (workspace.CurrentCamera.CFrame*keybindVector-workspace.CurrentCamera.CFrame.Position)*Options.FlySpeed.Value/0.745 --comment this out to use tp method
				root.AssemblyAngularVelocity = Vector3.zero --just to prevent the angular wierdness (acctually caused real issue)
				--root.AssemblyLinearVelocity = Vector3.zero --tp method
			end
		end
	else
		if(workspace.Gravity == 0 and getgenv().g ~= null) then
			workspace.Gravity=getgenv().g
		end
		if getChar() and getChar():FindFirstChild("Humanoid") then
			getChar().Humanoid.PlatformStand = false
		end
	end
end)

Options.Fly:SetValue(false)

local Slider = Section:AddSlider("FlySpeed", {
	Title = "Fly Speed (MPH)",
	Description = "0.745 Miles/Stud",
	Default = 16*0.745,
	Min = 0,
	Max = 1000,
	Rounding = 1,
	Callback = function(Value)
		--print("Slider was changed:", Value)
	end
})
Options.FlySpeed:SetValue(16*0.745) --this line would load the configs value

local Keybind = Section:AddKeybind("FlyKeyBind", {
	Title = "KeyBind",
	Mode = "Toggle", -- Always, Toggle, Hold
	Default = "None", -- String as the name of the keybind (MB1, MB2 for mouse buttons)
	Description = "Key to Press to activate Flight",

	-- Occurs when the keybind is clicked, Value is `true`/`false`
	Callback = function(Value)
	print(Options.Fly)
		Options.Fly:SetValue(not Options.Fly.Value)
	end,

	-- Occurs when the keybind itself is changed, `New` is a KeyCode Enum OR a UserInputType Enum
	ChangedCallback = function(New)
		print("Keybind changed!", New)
	end
})

Options.FlyKeyBind:SetValue("None", "Toggle")

-- [[[[[[[[[[Nullity]]]]]]]]]]


local DiceMngmnt = Tabs.Main:AddSection("Dice Management", "shopping-bag") -- Create section with icon
local Toggle = DiceMngmnt:AddToggle("AutoFind", {Title = "Nullity Spam Rejoin",Description = "Create a Config in settings to make this work", Default = false })

Toggle:OnChanged(function()
    local list = SaveManager.Options.SaveManager_ConfigList

    if(Options.AutoFind.Value) then
        if((list == nil or list.Value == nil)) then
            Fluent:Notify({
                Title = "Config Is Missing",
                Content = "Please Select a Config and set it to autoload to make this script function",
                Duration = 2
            })
            Options.AutoFind:SetValue(not Options.AutoFind.Value)
        else
            if (getgenv().loadedBaddieScript) then
                Window:Dialog({
                    Title = "Warning",
                    Content = "Spam Rejoin is a script which modifies your config, Beware",
                    Buttons = {
                        {
                            Title = "Confirm",
                            Callback = function()
                                Fluent:Notify({
                                    Title = "Saving Config",
                                    Content = "New State being saved to config, ".. list.Value,
                                    Duration = 2
                                })
                                SaveManager:Save(list.Value)
                                task.spawn(function()
                                task.wait(2)
                                if Options.AutoFind.Value then randomRejoin() end
                                end) 
                            end
                        },
                        {
                            Title = "Cancel",
                            Callback = function()
                                Options.AutoFind:SetValue(false)
                            end
                        }
                    }
                })
            else
                task.spawn(function()
                    task.wait(2)
                    if getgenv().pauseAutoRejoin then 
                        while getgenv().pauseAutoRejoin and task.wait() do end
                    end
                    if Options.AutoFind.Value then randomRejoin() end
                end) 
            end
        end
    else
        if(list and list.Value and getgenv().loadedBaddieScript) then
            SaveManager:Save(list.Value)
        end
    end
end)
Options.AutoFind:SetValue(false)

function numberToString(n)
    local numbers = {[3] = "K",[6] = "M",[9] = "B",[12] = "T",[15] = "Qd",[18] = "Qn",[21] = "Sx",}
    local n2 = math.floor(math.log10(n)/3)*3
    if(n2<=0) then return tostring(n) end 
    if(n2>=24) then n2=21 end
    return ("%.3g"):format(n/math.pow(10,n2))..numbers[n2]
end

-- [[[[[[[[[[Eggs]]]]]]]]]]

local eggs,prices = getEggs()
local Section = Tabs.Main:AddSection("Hatching", "egg") -- Create section with icon
local Dropdown = Section:AddDropdown("EggType", {
    Title = "Egg Type",
    Values = eggs,
    Multi = false,
    Search = true, -- optional; default true
    Default = 1,
})
Dropdown:SetValue(eggs[1])
local Slider
Slider = Section:AddSlider("EggCount", {
	Title = "Egg Count - "..prices[SaveManager.Options.EggType.Value]*20,
	Description = "Amount of Eggs to Open",
	Default = 20,
	Min = 1,
	Max = 100,
	Rounding = 0,
	Callback = function(Value)
        if Options.EggType and Options.EggCount then 
            Slider:SetTitle("Egg Count - "..numberToString(prices[Options.EggType.Value]*Options.EggCount.Value)) 
        end
	end
})
Options.FlySpeed:SetValue(20) --this line would load the configs value
Dropdown:OnChanged(function()
if Slider ~=nil then
    if Options.EggType and Options.EggCount then 
        Slider:SetTitle("Egg Count - "..numberToString(prices[Options.EggType.Value]*Options.EggCount.Value)) 
    end
end
end)
Section:AddButton({
    Title = "Buy Eggs - No Animation",
    Description = "Check your pet inventory to see what you got",
    Callback = function()
        buyEgg(Options.EggType.Value,Options.EggCount.Value)
        Fluent:Notify({
            Title = "Egg Results",
            Content = "You Spent "..numberToString(prices[Options.EggType.Value]*SaveManager.Options.EggCount.Value).." on ".. Options.EggType.Value,
            SubContent = "Check Your Pet Inventory to See if You Got Anything", -- Optional
            Duration = 5 -- Set to nil to make the notification not disappear
        })
    end
})

function getEvents()
local mod = game:GetService("ReplicatedStorage").Modules.Mutations
local mod = require(mod)
local events = {}
local colors = {}
for i,v in pairs(mod) do
    events[#events+1] = v.Event
    colors[v.Event] = v.Color
end
return events,colors
end


local Weather = Tabs.Main:AddSection("Weather", "cloud-rain-wind")
local wc = game:GetService("ReplicatedStorage"):WaitForChild("status")
if(getgenv().wcCon ~= nil) then getgenv().wcCon:Disconnect(); getgenv().wcCon = nil end
local Dropdown = Weather:AddDropdown("Events", {
    Title = "Events To Find",
    Values = getEvents(),
    Multi = true,
    Search = true, -- optional; default true
    Default = getEvents(),
})

Dropdown:SetValue(getEvents())

function setWeatherName()
    local w,t = getWeather()
    if(w==nil) then 
        Weather.Container.Parent.Frame.TextLabel.Text = "Weather"
    else
        Weather.Container.Parent.Frame.TextLabel.Text = "Weather ~ "..t
    end
end
setWeatherName()
getgenv().wcCon = wc.AttributeChanged:Connect(function()
    setWeatherName()
    if(getgenv().pauseAutoRejoin and Options.AutoWeather.Value) then
        getgenv().pauseAutoRejoin = false
    end
end)
local Toggle = Weather:AddToggle("AutoWeather", {Title = "Weather Spam Rejoin",Description = "Create a Config in settings to make this work", Default = false })

Toggle:OnChanged(function()
    local list = SaveManager.Options.SaveManager_ConfigList

    if(Options.AutoWeather.Value) then
        if((list == nil or list.Value == nil)) then
            Fluent:Notify({
                Title = "Config Is Missing",
                Content = "Please Select a Config and set it to autoload to make this script function",
                Duration = 2
            })
            Options.AutoWeather:SetValue(not Options.AutoWeather.Value)
        else
            if (getgenv().loadedBaddieScript) then
                Window:Dialog({
                    Title = "Warning",
                    Content = "Spam Rejoin is a script which modifies your config, Beware",
                    Buttons = {
                        {
                            Title = "Confirm",
                            Callback = function()
                                Fluent:Notify({
                                    Title = "Saving Config",
                                    Content = "New State being saved to config, ".. list.Value,
                                    Duration = 2
                                })
                                SaveManager:Save(list.Value)
                                task.spawn(function()
                                task.wait(2)
                                if Options.AutoWeather.Value then randomRejoin() end
                                end) 
                            end
                        },
                        {
                            Title = "Cancel",
                            Callback = function()
                                Options.AutoWeather:SetValue(false)
                            end
                        }
                    }
                })
            else
                task.spawn(function()
                    task.wait(2)
                    if getgenv().pauseAutoRejoin then 
                        while getgenv().pauseAutoRejoin and task.wait() do end
                    end
                    if Options.AutoWeather.Value then randomRejoin() end
                end) 
            end
        end
    else
        if(list and list.Value and getgenv().loadedBaddieScript) then
            SaveManager:Save(list.Value)
        end
    end
end)
Options.AutoWeather:SetValue(false)

local tgl = DiceMngmnt:AddToggle("AutoBuy", {Title = "Auto Buy All Dice", Default = false })
if(getgenv().buyallconnection) then getgenv().buyallconnection:Disconnect();getgenv().buyallconnection =nil end
getgenv().buyallconnection=game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("top_not"):WaitForChild("Frame").ChildAdded:Connect(function()
if Options.AutoBuy.Value then
buyAll()
end
end)
tgl:OnChanged(function()
    if Options.AutoBuy.Value then
        print("buying")
        buyAll()
        print("bought all")
    end
end)

Options.AutoBuy:SetValue(false)

------SELLING VARIABLES & FUNCTIONS
    local stuff = {

    }
    repeat task.wait() until game:GetService("Players").LocalPlayer
    local mutations = require(game:GetService("ReplicatedStorage").Modules.Mutations)
    local baddieData = require(game:GetService("ReplicatedStorage").Modules.BaddieData)

    for name,data in pairs(baddieData) do
        for mName, mData in pairs(mutations) do
            table.insert(stuff, {
                ["name"] = "["..mName.."] "..data.Rarity.." "..name,
                ["color"] = mData.Color,
                ["cps"] = data.BaseCash*mData.CoinMultiplier,
                ["baddie"] = name,
                ["mutation"] = mName
            })
        end
        table.insert(stuff, {
            ["name"] = "[Normal] "..data.Rarity.." "..name,
            ["color"] = ColorSequence.new(Color3.new(1,1,1)),
            ["cps"] = data.BaseCash,
            ["baddie"] = name,
            ["mutation"] = "Normal"
        })
    end

    function findClosest(n)
        local higher = 0
        local hb = nil
        local lower = 0
        local lb = nil
        for i,v in pairs(stuff) do
            --print(v.cps)
            if (v.cps >= n) then
                if higher>=v.cps or hb == nil then
                    higher = v.cps
                    hb = v
                end
            else
                if lower<=v.cps or lb == nil then
                    lower = v.cps
                    lb = v
                end
            end
        end
        
        local retval = hb ==nil and lb or (lb==nil and hb or (math.abs(higher-n)<=math.abs(lower-n) and hb or lb))
        if retval.cps == n then
            return retval,"&lt;="
        --elseif retval.cps >n then
        --    return retval,"<"
        else
            return retval,"&lt;"
        end
    end--finds baddie closest to certain number

    function uthenasia(id,baddie,threshold)
        if Options.sellThreshold and Options.AutoSell and (tonumber(Options.sellThreshold.Value) ~= tonumber(threshold) or not Options.AutoSell.Value) then
            return false
        end
        threshold = tonumber(threshold)
        local mutatonMult = 1
        table.foreach(baddie.m, function(_,n) if mutations[n] then mutatonMult *= mutations[n].CoinMultiplier end end)
        local earnings = mutatonMult*baddieData[baddie.n].BaseCash
        if earnings < threshold then
            local rs = game:GetService("ReplicatedStorage")
            rs.Events.equip:InvokeServer(id, true)
            rs.Events.sell:InvokeServer("specific")
            return true
        end
        return false
    end

    function deleteAllBaddies(threshold)
        threshold = tonumber(threshold)
        local s = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("Main"):WaitForChild("RestockScript")
        local senv = getsenv(s)
        repeat task.wait() until senv._G.Profile
        local profile = senv._G.Profile
        local sellcount = 0
        for id,data in pairs(profile.Data.inv.unique) do
            --print("----"..id.."---- "..table.concat(data.m," ").." ".. data.n)
            if(Options.sellThreshold and Options.AutoSell and (tonumber(Options.sellThreshold.Value) ~= threshold or not Options.AutoSell.Value)) then
                return sellcount
            end
            uthenasia(id,data,threshold)
            sellcount = sellcount+1
        end
        return sellcount
    end


local tgl = DiceMngmnt:AddToggle("AutoEquippedBest", {Title = "Auto Equipped Best", Default = false })
tgl:OnChanged(function(value)
    if value and getgenv().equippedChange then
        getgenv().equippedChange()
    end
end)
tgl:SetValue(false)
--- END OF SELLIGN VARS AND FUNCS
local autoSell = Tabs.Main:AddSection("Auto Sell Baddies", "list-x")
local smallest = findClosest(0)
local biggest = findClosest(math.huge)
local slider
slider = autoSell:AddSlider("sellThreshold", {
    Title = "Baddie Sell Threshold",
    Description = "if baddie Cash / S <= \nthen it will be sold",
    Default = smallest.cps,
    Min = smallest.cps,
    Max = biggest.cps,
    Rounding = 2,
    Callback = function(Value)
        if Options.sellThreshold then
            local closest,direction = findClosest(tonumber(Value))
            slider.Elements:SetDesc("if Cash / S "..direction.." "..numberToString(Value))
            autoSell.Container.Parent.Frame.TextLabel.Text = "AutoSell "..direction..GradientFromColorSequence(closest.name, closest.color)
            if Options.AutoSell and Options.AutoSell.Value then
                task.spawn(deleteAllBaddies,tonumber(Options.sellThreshold.Value))
            end
        end
    end
})
slider:SetValue(smallest.cps)

local Toggle = autoSell:AddToggle("AutoSell", {Title = "Auto Sell", Default = false })
Toggle:OnChanged(function(value)
    if value then
    task.spawn(deleteAllBaddies,tonumber(Options.sellThreshold.Value))    
    end
end)


local Section = Tabs.Main:AddSection("General", "message-circle") -- Create section with icon
Section:AddButton({
        Title = "Discord Link",
        Description = "Coppys Discord Link To Clipboard",
        Callback = function()
            setclipboard("https://discord.gg/JXq5A4K8")
            Fluent:Notify({
                Title = "Coppied Discord To Clipboard",
                Content = "https://discord.gg/JXq5A4K8",
                SubContent = "Link May Be Invalid",
                Duration = 5 -- Set to nil to make the notification not disappear
            })
        end
    })
----[[


local Toggle = Section:AddToggle("AutoExecute", {Title = "Auto Execute", Default = true })
Toggle:OnChanged(function()
    if getgenv().autoExec then getgenv().autoExec:Disconnect(); getgenv().autoExec=nil end
    if Options.AutoExecute.Value then
        getgenv().autoExec = game:GetService("Players").LocalPlayer.OnTeleport:Connect(function(State)
            getgenv().autoExec:Disconnect()
            queue_on_teleport(
                "if not game:IsLoaded() then game.Loaded:Wait() end;"..
                "if game.PlaceId ~= 79305036070450 then return end;"..
                'local get =nil; repeat get = game:HttpGet("'..root..'baddie.lua") until typeof(get) =="string"'..
                'loadstring(get)()'
            )            
        end)
    end
end)

Options.AutoExecute:SetValue(true)
--]]
--End Of Real Script

Window:SelectTab(1)
while game:GetService("Players").LocalPlayer.Character ==nil do
    task.wait()
end
game:GetService("Players").LocalPlayer.Character:WaitForChild("HumanoidRootPart")
SaveManager:LoadAutoloadConfig()
getgenv().loadedBaddieScript = true
Fluent:Notify({
    Title = "Fluent",
    Content = "The script has been loaded.",
    Duration = 2
})
task.spawn(function()
if Options.AutoFind.Value and nullityExists() then
    getgenv().pauseAutoRejoin = true
    SaveManager:Save(SaveManager.Options.SaveManager_ConfigList.Value)
    Fluent:Notify({
        Title = "Nullify Has Been Found",
        Content = "NULLIFFFYYYYYYYYYY",
        Duration = 2
    })
    local plrGUI = game:GetService("Players").LocalPlayer.PlayerGui
    --local btn = plrGUI:WaitForChild("loading"):WaitForChild("Frame"):WaitForChild("skipbutton")
    local frame = plrGUI:WaitForChild("loading"):WaitForChild("Frame")
    frame.BackgroundTransparency = 1
    local nullityRoot = workspace.Nullity.Nullity:WaitForChild("HumanoidRootPart")
    local char = game:GetService("Players").LocalPlayer.Character
    local humanoid = char.Humanoid
    local pos = nullityRoot.Position
    while humanoid.RootPart.Anchored and task.wait()  do
        humanoid.RootPart.Anchored = false
    end
    game:GetService("Players").LocalPlayer.Character.Humanoid:MoveTo(pos)
    setConveyer(false)
    humanoid.MoveToFinished:Wait()
    setConveyer(true)
    task.wait(0.1)
    while humanoid.RootPart.Anchored and task.wait()  do
        humanoid.RootPart.Anchored = false
    end -- repeat because idk why
    while (humanoid.RootPart.Position-pos).Magnitude > 0.1 and task.wait() do
        humanoid.RootPart.Anchored = false
        humanoid.RootPart.CFrame = CFrame.new(pos)
    end
    while not game:GetService("Players").LocalPlayer.PlayerGui.Main.MerchantShop.Visible and task.wait() and nullityExists() and Options.AutoFind.Value do
        fireproximityprompt(nullityRoot.ProximityPrompt) --caused initial crash, if future cash becomes issue reffer to here
    end
    task.wait(2)
    for i2=1, 15, 1 do
        for i=1, 3, 1 do
            if(nullityExists()) then
                game:GetService("ReplicatedStorage").Events.MerchantBuy:InvokeServer(i)
                task.wait(0.1)
            end
        end
    end
    frame.Visible = true
    task.wait(3)
    getgenv().pauseAutoRejoin = false
end

end)
--AUTO SELL SECTION OF CODE
function spin()
    local result = game:GetService("Players").LocalPlayer.PlayerGui.Main.Dice.RollState:InvokeServer()
    if result.autoSold then warn("You sold A "..result.mutation.." "..result.outcome) end
--[[
    if(result ~=nil and result.success) then
        local sellcount = 0;
        if(Options.AutoSell.Value) then
            sellcount = deleteAllBaddies(Options.sellThreshold.Value);
        end
        if not result.autoSold and sellcount == 0 then
            print("You spun A "..result.mutation.." "..result.outcome)
        else
            warn("You sold A "..result.mutation.." "..result.outcome)
        end
    end        
]] --commented out because i added listen to baddie open
end
--listening to baddieOpen & dicen change
    --local s2 = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("Main"):WaitForChild("RestockScript")
    local s = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("Main"):WaitForChild("Dice"):WaitForChild("DiceManager")
    local m = require(game:GetService("ReplicatedStorage"):WaitForChild("Modules"):WaitForChild("DiceData"))
    local senv = getsenv(s)
    repeat task.wait() until senv._G.Profile
    local p = senv._G.Profile
    getgenv().invChange = function(...)
        local a,b = ...
        a=a.unique
        b=b.unique
        local id,data = nil
        for i,v in pairs(a) do
            if(b[i]==nil) then
            id = i;data=v
            end
        end
        if id then
            if Options.sellThreshold and Options.AutoSell and Options.AutoSell.Value and uthenasia(id,data,Options.sellThreshold.Value) then
                warn("You sold A "..table.concat(data.m," ").." "..data.n)
            else
                print("You rolled A "..table.concat(data.m," ").." "..data.n)
            end
        end
    end
    getgenv().isListening = getgenv().isListening and true or false
    if(not getgenv().isListening) then
        getgenv().isListening = true
        p:ListenToChange("inv",function(...)
            getgenv().invChange(...)
        end)
    end
    getgenv().equippedChange = function(...)
        if Options.AutoEquippedBest.Value == false then return end 
        --local newDice = ...
        local bestDice = nil
        table.foreach(senv._G.Profile.Data.dices, function(i,v)
            if (v <= 0) or m == nil then return end
            if bestDice == nil or bestDice.dice.Layout_Order <=m[i].Layout_Order then
                bestDice = {["name"]=i,["dice"]=m[i]}
            end
        end)
        if bestDice == nil or p.Data.equipped == bestDice.name then return end
        game:GetService("ReplicatedStorage"):WaitForChild("Events"):WaitForChild("updateRollingDice"):FireServer(bestDice.name)
        task.spawn(function() pcall(senv.updateDiceUI,bestDice.name) end)
    end
    getgenv().isListeningEquipped = getgenv().isListeningEquipped and true or false
    if(not getgenv().isListeningEquipped) then
        getgenv().isListeningEquipped = true
        p:ListenToChange("equipped",function(...)
            getgenv().equippedChange(...)
        end)
        ----[[

        p:ListenToArraySet("dices",function(...) --ListenToArraySet
            getgenv().equippedChange(...)
        end)
        --]]
    end
--
if Options.AutoWeather.Value and getWeather() ~= nil and Options.Events.Value[getWeather()] then
    getgenv().pauseAutoRejoin = true
    SaveManager:Save(SaveManager.Options.SaveManager_ConfigList.Value)
    Fluent:Notify({
        Title = "Weather Has Been Found",
        Content = game:GetService("ReplicatedStorage"):WaitForChild("status"):GetAttribute("event"),
        Duration = 2
    })
    local plrGUI = game:GetService("Players").LocalPlayer.PlayerGui
    --local btn = plrGUI:WaitForChild("loading"):WaitForChild("Frame"):WaitForChild("skipbutton")
    local frame = plrGUI:WaitForChild("loading"):WaitForChild("Frame")
    frame.BackgroundTransparency = 1

    while getgenv().pauseAutoRejoin and Options.AutoWeather.Value and task.wait(0.1) do spin() end
end
-- You can use the SaveManager:LoadAutoloadConfig() to load a config
-- which has been marked to be one that auto loads!
--Fluent provides Lucide Icons https://lucide.dev/icons/ for the tabs, sections and window's title, icons are optional everywhere 
--[[
local Tabs = {
    Main = Window:AddTab({ Title = "Main", Icon = "" }),
    Settings = Window:AddTab({ Title = "Settings", Icon = "settings" })
}

local Minimizer = Fluent:CreateMinimizer({
  Icon = "home", -- you can put AssetId
  Size = UDim2.fromOffset(44, 44),
  Position = UDim2.new(0, 320, 0, 24),
  Acrylic = true,
  Corner = 10,
  Transparency = 1,
  Draggable = true,
  Visible = true -- make minimizer visible on pc (DEFAULT TRUE), you can edit any setting in Minimizer variable. example: Minimizer.Visible = false
})

local Options = Fluent.Options

do
    local Section = Tabs.Main:AddSection("Section", "apple") -- Create section with icon


  
    Fluent:Notify({
        Title = "Notification",
        Content = "This is a notification",
        SubContent = "SubContent", -- Optional
        Duration = 5 -- Set to nil to make the notification not disappear
    })



    Tabs.Main:AddParagraph({
        Icon = "home",
        Title = "Paragraph",
        Content = "This is a paragraph with an icon.\nSecond line!"
    })

    Tabs.Main:AddParagraph({
        Content = "This is a paragraph without the title and icon!"
    })

    Tabs.Main:AddButton({
        Title = "Button",
        Description = "Very important button",
        Callback = function()
            Window:Dialog({
                Title = "Title",
                Content = "This is a dialog",
                Buttons = {
                    {
                        Title = "Confirm",
                        Callback = function()
                            print("Confirmed the dialog.")
                        end
                    },
                    {
                        Title = "Cancel",
                        Callback = function()
                            print("Cancelled the dialog.")
                        end
                    }
                }
            })
        end
    })



    local Toggle = Tabs.Main:AddToggle("MyToggle", {Title = "Toggle", Default = false })

    Toggle:OnChanged(function()
        print("Toggle changed:", Options.MyToggle.Value)
    end)

    Options.MyToggle:SetValue(false)


    
    local Slider = Tabs.Main:AddSlider("Slider", {
        Title = "Slider",
        Description = "This is a slider",
        Default = 2,
        Min = 0,
        Max = 5,
        Rounding = 1,
        Callback = function(Value)
            print("Slider was changed:", Value)
        end
    })

    Slider:OnChanged(function(Value)
        print("Slider changed:", Value)
    end)

    Slider:SetValue(3)



    local Dropdown = Tabs.Main:AddDropdown("Dropdown", {
        Title = "Dropdown",
        Values = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen"},
        Multi = false,
        Search = true, -- optional; default true
        Default = 1,
    })

    Dropdown:SetValue("four")

    Dropdown:OnChanged(function(Value)
        print("Dropdown changed:", Value)
    end)


    
    local MultiDropdown = Tabs.Main:AddDropdown("MultiDropdown", {
        Title = "Dropdown",
        Description = "You can select multiple values.",
        Values = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen"},
        Multi = true,
        Search = false,
        Default = {"seven", "twelve"},
    })

    MultiDropdown:SetValue({
        three = true,
        five = true,
        seven = false
    })

    MultiDropdown:OnChanged(function(Value)
        local Values = {}
        for Value, State in next, Value do
            table.insert(Values, Value)
        end
        print("Mutlidropdown changed:", table.concat(Values, ", "))
    end)



    local Colorpicker = Tabs.Main:AddColorpicker("Colorpicker", {
        Title = "Colorpicker",
        Default = Color3.fromRGB(96, 205, 255)
    })

    Colorpicker:OnChanged(function()
        print("Colorpicker changed:", Colorpicker.Value)
    end)
    
    Colorpicker:SetValueRGB(Color3.fromRGB(0, 255, 140))



    local TColorpicker = Tabs.Main:AddColorpicker("TransparencyColorpicker", {
        Title = "Colorpicker",
        Description = "but you can change the transparency.",
        Transparency = 0,
        Default = Color3.fromRGB(96, 205, 255)
    })

    TColorpicker:OnChanged(function()
        print(
            "TColorpicker changed:", TColorpicker.Value,
            "Transparency:", TColorpicker.Transparency
        )
    end)



    local Keybind = Tabs.Main:AddKeybind("Keybind", {
        Title = "KeyBind",
        Mode = "Toggle", -- Always, Toggle, Hold
        Default = "LeftControl", -- String as the name of the keybind (MB1, MB2 for mouse buttons)

        -- Occurs when the keybind is clicked, Value is `true`/`false`
        Callback = function(Value)
            print("Keybind clicked!", Value)
        end,

        -- Occurs when the keybind itself is changed, `New` is a KeyCode Enum OR a UserInputType Enum
        ChangedCallback = function(New)
            print("Keybind changed!", New)
        end
    })

    -- OnClick is only fired when you press the keybind and the mode is Toggle
    -- Otherwise, you will have to use Keybind:GetState()
    Keybind:OnClick(function()
        print("Keybind clicked:", Keybind:GetState())
    end)

    Keybind:OnChanged(function()
        print("Keybind changed:", Keybind.Value)
    end)

    task.spawn(function()
        while true do
            wait(1)

            -- example for checking if a keybind is being pressed
            local state = Keybind:GetState()
            if state then
                print("Keybind is being held down")
            end

            if Fluent.Unloaded then break end
        end
    end)

    Keybind:SetValue("MB2", "Toggle") -- Sets keybind to MB2, mode to Hold


    local Input = Tabs.Main:AddInput("Input", {
        Title = "Input",
        Default = "Default",
        Placeholder = "Placeholder",
        Numeric = false, -- Only allows numbers
        Finished = false, -- Only calls callback when you press enter
        Callback = function(Value)
            print("Input changed:", Value)
        end
    })

    Input:OnChanged(function()
        print("Input updated:", Input.Value)
    end)
end


-- Addons:
-- SaveManager (Allows you to have a configuration system)
-- InterfaceManager (Allows you to have a interface managment system)

-- Hand the library over to our managers
SaveManager:SetLibrary(Fluent)
InterfaceManager:SetLibrary(Fluent)

-- Ignore keys that are used by ThemeManager.
-- (we dont want configs to save themes, do we?)
SaveManager:IgnoreThemeSettings()

-- You can add indexes of elements the save manager should ignore
SaveManager:SetIgnoreIndexes({})

-- use case for doing it this way:
-- a script hub could have themes in a global folder
-- and game configs in a separate folder per game
InterfaceManager:SetFolder("FluentScriptHub")
SaveManager:SetFolder("FluentScriptHub/specific-game")

InterfaceManager:BuildInterfaceSection(Tabs.Settings)
SaveManager:BuildConfigSection(Tabs.Settings)


Window:SelectTab(1)

Fluent:Notify({
    Title = "Fluent",
    Content = "The script has been loaded.",
    Duration = 8
})

-- You can use the SaveManager:LoadAutoloadConfig() to load a config
-- which has been marked to be one that auto loads!
SaveManager:LoadAutoloadConfig()
]]
