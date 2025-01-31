/*

This is the background script for SSS. It's always running. Things it does:

- Injects content scripts (a.k.a. page scripts) into each tab that is opened, so that the engines popup can appear there.
- Registers the search engines to appear in Firefox's context menu.
- Trades messages with the content scripts.
	To initialize them, to be informed of search engine clicks to begin searches, etc.
- Detects changes to settings from the options page and resets all running page scripts to use the new settings.
	Also updates settings objects created on previous SSS versions to contain new settings.

Here you'll find the declarations for most classes and enums related to search engines and settings,
as well as the default settings and engines that come with SSS.

*/

var iconv;	// avoid TS compilation errors but still get working JS code

namespace SSS
{
	/* ==================================== */
	/* ====== Swift Selection Search ====== */
	/* ==================================== */

	// Set to true if you want to see SSS's logs in Firefox's "Browser Console".
	// In general, use for development and don't commit this enabled.
	const DEBUG = false;

	if (DEBUG) {
		var log = console.log;
	}

	// Base class for all engines.
	export abstract class SearchEngine
	{
		uniqueId: string;
		type: SearchEngineType;
		isEnabled: boolean;
		isEnabledInContextMenu: boolean;
		shortcut: string;
	}

	// SSS-specific engine base class, for copy to clipboard, open as link, etc.
	// (SearchEngineType: SSS)
	export class SearchEngine_SSS extends SearchEngine
	{
		id: string;
	}

	// SSS-specific engine "copy to clipboard".
	export class SearchEngine_SSS_Copy extends SearchEngine_SSS
	{
		isPlainText: boolean;
	}

	// User-created engine base class, for custom engines, browser engines and groups.
	export class SearchEngine_NonSSS extends SearchEngine
	{
		name: string;
		iconUrl: string;
	}

	// All custom engines created by the user (or imported from a search.json.mozlz4 file, the old way to import browser engines).
	// (SearchEngineType: Custom)
	export class SearchEngine_Custom extends SearchEngine_NonSSS
	{
		searchUrl: string;
		encoding: string;
		discardOnOpen: boolean;
	}

	// Search engines imported from the browser via the WebExtensions search API. More limited.
	// (SearchEngineType: BrowserSearchApi)
	export class SearchEngine_BrowserSearchApi extends SearchEngine_NonSSS
	{
	}

	// Group of search engines (or other groups).
	// (SearchEngineType: Group)
	export class SearchEngine_Group extends SearchEngine_NonSSS
	{
		enginesUniqueIds: string[];
		color: string;
	}

	export class Settings
	{
		// NOTE: When adding new variables, keep the same order used in the settings page, roughly divided by section.

		// Any unspecified settings go here. This is needed to support legacy variables that are now unused, like contextMenuEnginesFilter.
		[key: string]: any;

		useDarkModeInOptionsPage: boolean;

		searchEngineIconsSource: SearchEngineIconsSource;

		popupOpenBehaviour: PopupOpenBehaviour;
		middleMouseSelectionClickMargin: number;
		popupLocation: PopupLocation;
		popupDelay: number;
		minSelectedCharacters: number;
		maxSelectedCharacters: number;
		allowPopupOnEditableFields: boolean;
		hidePopupOnPageScroll: boolean;
		hidePopupOnRightClick: boolean;
		hidePopupOnSearch: boolean;
		useEngineShortcutWithoutPopup: boolean;
		popupOpenCommand: string;
		popupDisableCommand: string;
		mouseLeftButtonBehaviour: OpenResultBehaviour;
		mouseRightButtonBehaviour: OpenResultBehaviour;
		mouseMiddleButtonBehaviour: OpenResultBehaviour;
		shortcutBehaviour: OpenResultBehaviour;
		popupAnimationDuration: number;
		autoCopyToClipboard: AutoCopyToClipboard;
		websiteBlocklist: string;

		showSelectionTextField: boolean;
		selectionTextFieldLocation: SelectionTextFieldLocation;
		useSingleRow: boolean;
		nPopupIconsPerRow: number;
		iconAlignmentInGrid: IconAlignment;
		popupItemSize: number;
		popupSeparatorWidth: number;
		popupItemPadding: number;
		popupItemVerticalPadding: number;
		popupItemHoverBehaviour: ItemHoverBehaviour;
		popupItemBorderRadius: number;
		popupBackgroundColor: string;
		popupHighlightColor: string;
		popupPaddingX: number;
		popupPaddingY: number;
		popupOffsetX: number;
		popupOffsetY: number;
		popupBorderRadius: number;
		useCustomPopupCSS: boolean;
		customPopupCSS: string;

		enableEnginesInContextMenu: boolean;
		contextMenuItemBehaviour: OpenResultBehaviour;
		contextMenuItemRightButtonBehaviour: OpenResultBehaviour;
		contextMenuItemMiddleButtonBehaviour: OpenResultBehaviour;
		contextMenuString: string;

		searchEngines: SearchEngine[];
		searchEnginesCache: { [id: string] : string; };

		// sectionsExpansionState: { [id: string] : boolean; };
	}

	export class ActivationSettings
	{
		useEngineShortcutWithoutPopup: boolean;
		popupLocation: PopupLocation;
		popupOpenBehaviour: PopupOpenBehaviour;
		middleMouseSelectionClickMargin: number;
		popupDelay: number;
		// not a "setting", but needed info for content script
		browserVersion: number;
	}

	export class ContentScriptSettings
	{
		settings: Settings;
		sssIcons: { [id: string] : SSSIconDefinition; };
	}

	export class SSSIconDefinition
	{
		name: string;
		description: string;
		iconPath: string;
		isInteractive: boolean = true;
	}

	class SSS
	{
		settings: Settings;
		activationSettingsForContentScript: ActivationSettings;
		settingsForContentScript: ContentScriptSettings;
		blockedWebsitesCache: RegExp[];
	}

	export const enum SearchEngineType {
		SSS = "sss",
		Custom = "custom",
		BrowserLegacy = "browser",	// only kept for retrocompatibility; permanently turns into a "custom" engine after load
		BrowserSearchApi = "browser-search-api",
		Group = "group",
	}

	export const enum SearchEngineIconsSource {
		None = "none",
		FaviconKit = "favicon-kit",
	}

	export const enum PopupOpenBehaviour {
		Off = "off",
		Auto = "auto",
		Keyboard = "keyboard",
		HoldAlt = "hold-alt",
		MiddleMouse = "middle-mouse",
	}

	export const enum PopupLocation {
		Selection = "selection",
		Cursor = "cursor",
	}

	export const enum OpenResultBehaviour {
		ThisTab = "this-tab",
		NewTab = "new-tab",
		NewBgTab = "new-bg-tab",
		NewTabNextToThis = "new-tab-next",
		NewBgTabNextToThis = "new-bg-tab-next",
		NewWindow = "new-window",
		NewBgWindow = "new-bg-window",
	}

	export const enum AutoCopyToClipboard {
		Off = "off",
		Always = "always",
		NonEditableOnly = "non-editable-only",
	}

	export const enum SelectionTextFieldLocation {
		Top = "top",
		Bottom = "bottom",
	}

	export const enum IconAlignment {
		Left = "left",
		Middle = "middle",
		Right = "right",
	}

	export const enum ItemHoverBehaviour {
		Nothing = "nothing",
		Highlight = "highlight",
		HighlightAndMove = "highlight-and-move",
		Scale = "scale",
	}

	// not used anymore but needed for retrocompatibility
	const enum ContextMenuEnginesFilter {
		All = "all",
		SameAsPopup = "same-as-popup",
	}

	const sssIcons: { [id: string] : SSSIconDefinition; } = {
		copyToClipboard: {
			name: "Copy to clipboard",
			description: "[SSS] Adds a \"Copy selection to clipboard\" icon to the popup.",
			iconPath: "res/sss-engine-icons/copy.png",
			isInteractive: true,
		},
		openAsLink: {
			name: "Open as link",
			description: "[SSS] Adds an \"Open selection as link\" icon to the popup.",
			iconPath: "res/sss-engine-icons/open-link.png",
			isInteractive: true,
		},
		separator: {
			name: "Separator",
			description: "[SSS] Adds a separator.",
			iconPath: "res/sss-engine-icons/separator.png",
			isInteractive: false,
		}
	};

	let uniqueIdToEngineDictionary: { [uniqueId: number] : SearchEngine; } = {};

	// Default state of all configurable options.
	const defaultSettings: Settings =
	{
		// NOTE: When adding new variables, keep the same order used in the settings page, roughly divided by section.

		useDarkModeInOptionsPage: false,

		searchEngineIconsSource: SearchEngineIconsSource.FaviconKit,

		popupOpenBehaviour: PopupOpenBehaviour.Auto,
		middleMouseSelectionClickMargin: 14,
		popupLocation: PopupLocation.Cursor,
		popupDelay: 0,
		minSelectedCharacters: 0,
		maxSelectedCharacters: 0,
		allowPopupOnEditableFields: false,
		hidePopupOnPageScroll: true,
		hidePopupOnRightClick: true,
		hidePopupOnSearch: true,
		useEngineShortcutWithoutPopup: false,
		popupOpenCommand: "Ctrl+Shift+Space",
		popupDisableCommand: "Ctrl+Shift+U",
		mouseLeftButtonBehaviour: OpenResultBehaviour.ThisTab,
		mouseRightButtonBehaviour: OpenResultBehaviour.ThisTab,
		mouseMiddleButtonBehaviour: OpenResultBehaviour.NewBgTabNextToThis,
		shortcutBehaviour: OpenResultBehaviour.NewBgTabNextToThis,
		popupAnimationDuration: 100,
		autoCopyToClipboard: AutoCopyToClipboard.Off,
		websiteBlocklist: "",

		showSelectionTextField: true,
		selectionTextFieldLocation: SelectionTextFieldLocation.Top,
		useSingleRow: true,
		nPopupIconsPerRow: 4,
		iconAlignmentInGrid: IconAlignment.Middle,
		popupItemSize: 24,
		popupSeparatorWidth: 60,
		popupItemPadding: 2,
		popupItemVerticalPadding: 1,
		popupItemHoverBehaviour: ItemHoverBehaviour.HighlightAndMove,
		popupItemBorderRadius: 0,
		popupBackgroundColor: "#FFFFFF",
		popupHighlightColor: "#3399FF",
		popupPaddingX: 3,
		popupPaddingY: 1,
		popupOffsetX: 0,
		popupOffsetY: 0,
		popupBorderRadius: 4,
		useCustomPopupCSS: false,
		customPopupCSS: "",

		enableEnginesInContextMenu: true,
		contextMenuItemBehaviour: OpenResultBehaviour.NewTabNextToThis,
		contextMenuItemRightButtonBehaviour: OpenResultBehaviour.NewTabNextToThis,
		contextMenuItemMiddleButtonBehaviour: OpenResultBehaviour.NewBgTabNextToThis,
		contextMenuString: "Search for “%s”",
		// sectionsExpansionState: {},

		searchEngines: [

			// special engines (SearchEngine_SSS or a subclass)

			createDefaultEngine({
				type: SearchEngineType.SSS,
				id: "copyToClipboard",
				isPlainText: false,
			}),
			createDefaultEngine({
				type: SearchEngineType.SSS,
				id: "openAsLink",
			}),
			createDefaultEngine({
				type: SearchEngineType.SSS,
				id: "separator",
			}),

			// actual search engines (SearchEngine_Custom)

			createDefaultEngine({
				name: "Google",
				searchUrl: "https://www.google.com/search?q={searchTerms}",
				iconUrl: "https://www.google.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Bing",
				searchUrl: "https://www.bing.com/search?q={searchTerms}",
				iconUrl: "https://www.bing.com/sa/simg/favicon-2x.ico",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "DuckDuckGo",
				searchUrl: "https://duckduckgo.com/?q={searchTerms}",
				iconUrl: "https://duckduckgo.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Yandex.ru",
				searchUrl: "https://yandex.ru/search/?text={searchTerms}",
				iconUrl: "https://yastatic.net/iconostasis/_/8lFaTHLDzmsEZz-5XaQg9iTWZGE.png",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "Baidu",
				searchUrl: "https://www.baidu.com/s?wd={searchTerms}",
				iconUrl: "https://www.baidu.com/favicon.ico",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "YouTube",
				searchUrl: "https://www.youtube.com/results?search_query={searchTerms}",
				iconUrl: "https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png",
			}),
			createDefaultEngine({
				name: "IMDB",
				searchUrl: "https://www.imdb.com/find?s=all&q={searchTerms}",
				iconUrl: "https://www.imdb.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Wikipedia (en)",
				searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}",
				iconUrl: "https://www.wikipedia.org/favicon.ico",
			}),
			createDefaultEngine({
				name: "Amazon.com",
				searchUrl: "https://www.amazon.com/s?url=search-alias%3Daps&field-keywords={searchTerms}",
				iconUrl: "https://www.amazon.com/favicon.ico",
			}),
			// createDefaultEngine({
			// 	name: "Amazon.co.uk",
			// 	searchUrl: "https://www.amazon.co.uk/s?url=search-alias%3Daps&field-keywords={searchTerms}",
			// 	iconUrl: "https://www.amazon.com/favicon.ico",
			// 	isEnabled: false,
			// }),
			createDefaultEngine({
				name: "eBay.com",
				searchUrl: "https://www.ebay.com/sch/{searchTerms}",
				iconUrl: "https://www.ebay.com/favicon.ico",
			}),
			// createDefaultEngine({
			// 	name: "eBay.co.uk",
			// 	searchUrl: "https://www.ebay.co.uk/sch/{searchTerms}",
			// 	iconUrl: "https://www.ebay.com/favicon.ico",
			// 	isEnabled: false,
			// }),
			createDefaultEngine({
				name: "Translate to EN",
				searchUrl: "https://translate.google.com/?sl=auto&tl=en&op=translate&text={searchTerms}",
				iconUrl: "https://translate.google.com/favicon.ico",
			}),
			createDefaultEngine({
				name: "Google Maps",
				searchUrl: "https://www.google.com/maps/search/{searchTerms}",
				iconUrl: "https://www.google.com/images/branding/product/ico/maps15_bnuw3a_32dp.ico",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "Steam",
				searchUrl: "https://store.steampowered.com/search/?term={searchTerms}",
				iconUrl: "https://store.steampowered.com/favicon.ico",
				isEnabled: false,
			}),
			createDefaultEngine({
				name: "(Example) Search current site on Google",
				searchUrl: "https://www.google.com/search?q={searchTerms} site:{hostname}",
				iconUrl: "https://www.google.com/favicon.ico",
				isEnabled: false,
			}),
		],

		// Icon cache for every engine that comes active by default in SSS. Other engines' icons will automatically fill this object when they are loaded in the options page.
		searchEnginesCache: {
			"https://www.google.com/favicon.ico"                        : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEHklEQVRYhb2WXWwUVRTH56XBotQn33wQBXlTov3gQWtErKB9IGkptPYBxYox6INRa0LQQELRYqEJ8NAPLMQ0bCuBVqzQZhGpH91YJGYJaYMW0O1XZnb6xc7u7Nxz9u+D203vzGx3tlZPcl723j2///m4d66ieDRd1/OIqIqIWolokJl1ZraSHiaiweRapa7reV7jZjTTNNcRURszx+DRmDlKRCdN01y7ZDCAlUKIBmYmr2AXIUIIcTgUCuVmm/XjzHxzqWAXIUHTNNd4gluW9RQza26BaHwURvsXmHn/bYS3bYZasgHqi0UIl5Vg+r23YJxuBo3+lU6ECmC9l8wdcJoYw+z+j6BuKoT6QsHivqkQs598CJoYcxWRthKTk5P3u5U91tcD7ZXizGCba6XPwbzS59oO15kQQjTYNxtnTmUNXuhz9ftd2yGEqLeXfp192mN9PWkDT9VUItJyDLFvziHWcx6RluOYerNKhh+pAxKJdPMgpFYQUZvU8/FRaC8/6wDr1VsRvxZwDQoA8cEBhHeU4t7xz9PuSTGIWhVFURQAD9ovmUjjOw749J7XkJibyxg4YUQy7gEAZjY0TVulEFGVFCA6AtG7ArO1j6Tg4W2bwTNTngJnY0S0XSGiVknZnToIfw6EPwfGsYegbclH7NKFZYcnBTQpRDQo/fhrSUqA8Ocgfm41IMR/JSCgMLO+8EfR/7AkgG5ULhpk48GIZ79yU06EmVWFmS1JwOUVkgD+Y9+yCWj/SUKBmeP/q4C2q3FXAWFJgL0FwR3LJqAz4KiA6hzC6y9JAkb7n4DF2Q/hbZUdAq4OyXGIKOByDD9NwS/0rMYzvq3oGvFnLcA3YDkETMzIV/P8MZTGPBG9g6g/F3VdTyPfV4Z8XxlKul5HODbtGX4vlkB5oyHBdzZFHfuIqELRdT2PmaXVowMHUvB5r+79ADPxzFexRUDtmZgj+w5n/w0AD8x/jE4uXByPqCg++6pDROnXu9E/di0t/Nb0Xezq9mHjwVkJXt5oIBp3lL954ed4LbM8aRfv9jsEzHv5t++i4XobOm9dxFe/X8KJYDve8O9Fga8c+b4yFJ2qxfOfhVICfhiW37XMbJmm+Zj9QXLYntGXw91pRWTygvadKD7yi+PsA4AQ4pDjRQRgJTPfsG/u/fNHFJ+tzlpAUUcFWoLdDjgz/wbgvnSP0jXJ16tkE4aGvT8fRWFHuSf47u8+xtDUiBt8EsCjrvAFlVjvJgL4ZzhPD53Hnu8PYEt3DTZ0VqCoowIlXbtQc3kfTgTbMTx12+2vYOZJy7KeXBRuq0TQNdISLFn2xTO3WygUyhVC1NtPR5ZgSwhxCOl67rUaRNSavDi8gg0ianYctX9jmqatIqLtRNRERAFmVpk5nnSViALJtQrM33Ae7G92y3s6IRzKLQAAAABJRU5ErkJggg==",
			"https://duckduckgo.com/favicon.ico"                        : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFnklEQVRYhcVXb0wTZxzmEyZsbovJnG7xw0j2wZm55K4jWzQh0wwkZFsMgetVMhVB0Bm3ocEMo2MoEZcwkzlYLIHJUIGJdraoiAwq2yRz0TEcTgz3p73SUQo97or0P88+dDutvXqd27I3edP70N/7/N7n97y/PykpSS5U5adyhoxshibqOYrsZyjdKEMR3ujWjXIU2c/QRD1nyMhGVX5qsudqrpFNK5ZwFNnA0DqJ1ZNwVBbC3VwL0dQE2WqGbDVDNDXB3VwLR2UhWD0JhtZJHEU2jGxaseSRgZGTs4AvIKs5mpi178iF1N2O0LQLwQkBcp8Jnk4j3I01cDfWwNNphNxnQnBCQGjaBam7HfYdueBoYpYvIKuRk7PgEW5NDPJFmZixtCLslSCaWyDsLgCrJx+6hd0FEM0tCHslzFhawW3OBEcRg0mzwdLESobWCUJ5HoJOG+SBLti2rdMEfnDbtq2DPNCFoNMGoTwPDK0ThA3kS5o3Z2id4KwuRVgS4TYeBKsnMb6/CFJ3B6Tes5g++RnsO99O2hG38SDCkghndSkYWickZAI5OQs4ihgUyvOiBjXblUM8HV8gLHlw//L9dgNCeV5STjhrtiMsiRDK88BRxKCqJvgCspovykTQaVNurtBZlg1bWTZcR/fCPzaiOBGWRbiNB8AXr9FmorEGQacNfFEm+AKyOl50NDE7Y2mFfMUSZ8xveR13b3yHRCvsnYHz4xJNJ+SBrqgwaWI2JhQcRTbYd+Qi7JVUBecf+zUhuOKEOAW+9A1NYYa9UvSJUmRDNPZV+akMrZOk7naI547HGU0cqQAAcOMeXP2Zx5w/FAd+i3HhwsBtOCwdmiyI5hZI3e1gaJ2EqvzUFM6Qkc3qSYSmXarvfOZiGwDg+ohDk4VIwAe+ZK1mnghNu8DqSXCGjOwUhibqHZWFCE4Iqgaz1/oVgEAwDFH2qYK3fHMdg0M2uI7u1WQhOCHAUVkIhibqUziK7Hc3H4bcZ1IXjtWigBTv68T6nV/BF4gPQ/4HJ/BJkxVSz2ltMfaZ4G6uBUeR/SkMpRsVTU3wdBpV/+w506iAtJ0fwv6jPaoMzM9Hf2Xrn6/IQMJZsRyexmWY+fI5jO968d6ZnUaIpiYwlG40haEIr2w1w91Yo+rARN1uzdhjfg7w3QS8vZjrN2D2zGKEf3ockeE0RIbTEPzhCTgrlsfkBNlqBkMRXk0HbO/mPgTYj3nnLkRuPqmAKfuXNNw1Pw3XgRfAbohPSrLVDIbWyZohYPVkXBpW8IWSKNjQY5BOLYW3YwnktqWYqkuHbevLCc+LCUFUhLUJRcjqyYRZcF4oRmQ4Db5LizSFl1iEGs+Q1ZPwnD6mHoKwiLnL6YgMp2HWtBhTdelwH07H1KfPY6blWfguLULo2kLYy1Y+5BlqJCJWT+L3w+8llIH9/fWwl67EVF06vJ3PIDDwFELXFsLXswieY8tgL40Fj0tEManY3KLqAF+yNqEDQgX1t+iPS8XJFCNWTyI4Oa7qwOTn+5IGVy1GceV4oEvV2HtVPQE9WL5vF+rA0AnEl6gcazUkrJ7EVOsRAAAj3cJ57hQm56KMRO56wRa+ijFahxOHVmN7dxa697wWZ+82HkTQaQO3WaUh0WrJWD2J8Y+2AACuOLpQ0puFrd9m49CPu7CzLx9ll9Zh79drUNKbhZLeLLTXrI6xTaoli2lKD8Q2payeBPfOKsxHwrjq7FGADJYs5bu49953a+3qmJsn1ZT+teLa8isWRZgB/g6G3IMK0Mbzb8LQlYWii2+h7dRGVJ2MsnC6etWjteUxonxwMDl3HN7By3DNjWPP94W4wLfDH55TxBhwcGDpV8B8SMFj+QeDyf2aUBvNQqIbfv4O/PwoAvYxBOxj8POj8PN3EJp0/jujWTwb/8NwGsfIfzSe/wEDn3UUirFnMwAAAABJRU5ErkJggg==",
			"https://www.youtube.com/yts/img/favicon_144-vfliLAfaB.png" : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA0klEQVRoge2YwQ2EIBREfwmUYCmWYCmWsB1YgqVQEiXMXiDxgCskCEx2XjJHdR75UcFMCCGEqABmDmYrzD4x/hIU5npNus8KM9eyaGmZLqkpXrOSveOfyh8TlHzKQTM2VeMEs210sYpsOYEwQbHSBNrxSZHA6LwnAAAhkAsk9p1cIOEcuUCCXgAAzpNcILEsEtAIVQu0ekZ3AdrXKO2HjPpXolMkMDo5AfotJfemnmmMsuWjAPfBVpTwE5S8i/9ZfuZxKi5eKPfK8XrTkkIIIf6CLwP44M2GNwfzAAAAAElFTkSuQmCC",
			"https://www.imdb.com/favicon.ico"                          : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAE20lEQVRogdWVyW+TVxTFL0hGLKh1LVVCCtgk7226qdRFV911A5VA6qJAQklLNyUQoFIRkxgKAcQkiELiKAlx4ozEGezEsePY2NgJBAJpQqJMTQhVW3VUp3/hdFH5q5/fF7LtW/wWPu/e8875ZH+mZz0Mk6HxbsbfS9JIxrsZ9DTA+OsbaSRPAwx60sX4c0EayZMuBo11Mv6Yk0Yy1smgxx2M32elkTzuYNBoO+O3GWkko+0MGmlj/DotjWSkjUEjLYxfpqSRjLQwKONn/DwpjSTjZ1C6mfHThDSSdDOD0k2MH59LI0k3MSjlY/wwLo0k5WNQspHx/VNpJMlGBj1oYHw3Jo3kQQOD4vWMbx9JI4nXM2i4jvFqVFpMRoogPA6L/R868WpUwluxWdFzz16NSu1MeByr6sLjwBefuZBo91j7+f7eis1KLjuG6xg0XMtYyUiLRKsHRGRR5HZgJSNx7IBL0YkIGxzrsJKRmE8I7YyIsJKRtnouxw64bP2z+usYrmVQzMt4mZYW8Ra9wMu0fQEist3JPVurQHbOrkDW++twkZIxS8zLoKEaxnJKWgz79QLLKYmjn9oXGPZ7Vj1bTukFllMSGxzr1vR49+2NypzzjfVKzuWUxFANg4aqGUtJaRFr1gssJSWOfmIf8u6Fzdj5/ibbs6WkXmApKVHkdiharNmzqn8uXx17U8k6VM2gyF3GYkJaRH15BbY6sJiQOFKqXuDctB5EhCOlLhRtdShalsWEXmAxIa35LFGfR/Mv2eVEyS6noh0pdSlZI3cZNFjFWIhLi2ijXmAhLlGed0E2RG6Y/GALcb3AQtymQKNH8y8vddlquVkHqxgUrmTMx6RFpEEtULjVgfmYRPl+1ax4579PJ/d7mtWyzMf0AvMxicK8ApEGj+Zfvt9lq+VmDVcyaOAOYy4qLQbr9QJzUYnDH6tm+Z/ttLmoXmAuqhcYrPfY+ttpuVkH7jCo/zZjNiIswnVutcAWB2YjAof3qWb+6wXabyJ/Zjai/z/MRgQKt6gFwnVubffwPpetlpu1/zaDQrcYM2Fh0V+rF5gJCxwqUc3s5vJnZsJ6gZmwXqC/1q3tHipx2Wq5WUO3GBS8yZgeEBb9Xj3Y9IBAWZ7Z9IAabs8HzjVnsppWwOvWdstKXLZabtbgTQb13WC8CAmLUI1e4EVIoKxYNXsRUsOVFbvWnMlq+a/bUI1b27XzKyt2KVn7bjCo9zpjKigsgtVqgW0FDkwFBQ7uVc2mggLbCv57ksFqt+1MfoH88ESETGuhtrt7hxO7d6hvtYN7XUrW3usM6rnGmOwVFn1VeoHJXoGDe9QLJnvVAn1VbtuZ/LB22Pnbca+iQMnac41BgauMiW5h0VOpF5joFvh8t3pBvrbazOsCvfPWRqSaCm13P9ruVP5jtr+3Sck50S0QuMqgwBXG84D439Jd6UbSV2h7FrjCoK7LjGddwki6LjPofgVjvFMYyf0KBnVeYjxpF0bSeYlBHRcZY23CSDouMqj9AuNxizCS9gsMajvPeOQXRtJ2nkGt5xijTcJIWs8xqOUsY8QnjKTlLIP8Zxjpe8JI/GcY1Hya8bBeGEnzaQY1nWKk6oSRNJ1ikO8kI1krjMR3kkGNJxgPvMJIGk8wqOE4I14tjKThOIPqv2SYzD/ZLZPkdY1wuAAAAABJRU5ErkJggg==",
			"https://www.wikipedia.org/favicon.ico"                     : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAADH0lEQVRoge1Z7Y3sIAwkVdAGXdACHaQDWkgFFJEKUgIl0AJV4PdrIuAIOMmusnvvTrJ00jrB4xl/oAjR+Usp0SdYL8aPDfoSmKeDuwXi6aBugXg6mNsgng7k/wbwdBC3QTwdwB+ApwP4A4B/tNaklCKlFGmtyRhTWP67tZZSSmx/7z2t63roD9/Re+FnjPkJwHtP1lpSStE0TU2TUtKyLOS9p5QSbdtG8zwXPkIIEkLQNE00zzOt60opJQohkHOOtNY//LXW5JyjEMLhe/Pz4deUUIyRrLV7EPnDMcYmjeu6kpSyeGZZlqZvCKFIknPuUB7Lsux+Wuvm+c0aiDGSMaYAkNPWMmttwQDk0Hu3tfYwKUgMkpdnnVXE27YVWVVKdQ/z3heZPWLMe09SSlJKHQYFc86REOKQzS6AGCPN87xnVAhB27axWOjJY1kWEkLstdE7H0WLmjsFoNa2EIKUUt1DoW+wVrOA7B/puVZAT4osAMhCzkIvGy0WcvrRWTjZN8aQlHLI+nCQOeeKgLTWQxaklHtBgwXvPasZgCmu7xBAjHGXBWxUfHUPt9ayM4o64TDFApDLAgBGmQELeS1gsHEShi7FiY0FIJcFbFSExphisPV6eUuyvQF3GgACygGMshlCKNaF3iTPDdnn+J4CgBbIWS2OQI9a4rquw8F1GUBKaZ+0kMbooLqYR9NXa81m6hKAbdsKWfQKLZcQhwXvPQkhWIV+GQA0msvoqNggHyxk+RxpsQB/TqHfAoAFC9YabBhEyCY60pH0wBZncN0GkLOA7lIPnFrLdUeqawG1cjb7lwFgo2zdFdBJamnVHQm/Y3CNVpSXAsChkIWUcl/ysALXnQSyyjtSjHFfG0ZL4ksBpJSKayd6N6Zoa4fB/aJmARf4q3FcBhBCKIpZSjnc9fM2jC7Gudy8BUDr3jxNU3fbxDM58DNrw0sBtHTNGUL1XOAubW8BgBsb5MDZ9XPmuBvq2wAgo5y7a24o9jPPvA1ACIGstafaIDrS1db5UgBP21d/pfkd38h+BYBvBNH6WP81IJrBfwuIbvCfCqYX4z8UwrBWOPp89wAAAABJRU5ErkJggg==",
			"https://www.amazon.com/favicon.ico"                        : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEq0lEQVRogc1aQWvjRhQWWPoFPq6V00LZQ8HJrZcUEvu0lwSkubfQ5J6Cf8Cy9XkXKws9hQiKfVh3nb000Mop5BTvmN1LqNVC20MjqGGxkbuFzWG/HsbjleSZsSXHdh884jh60vfNfO/NG2U0TWAAHgI4AfAa6zcK4FsAZRHWJPBPAVytF6/SLgHcl4F/CGC0ZoDz2BDA50nwRQD/LnJX3/dRcxzYhMAmBDldh24Y0A0Du+UybEJQcxxQSu+KxCccfA4LaN05PkZxcxO6YSA3dl3gucjP4uYmWmdni5K45ASsLNG+70+A6wLgMiJRt2wbYRguQmJHA9DIAv6eaaYCK5uRUrmM0Shz6j3TALxNExEEAQobG6kBx8DrekxuNcfJSuB3LW1EpVJZCLzI75lmVgLvUxEIgkCdoLo+SVBKKSilqDkOChG5yTxrdUpF4PT0VEmgUqkI43zfF5KI5k5WGaUiYBEiBJEzDBRMU5mMlUpFmewrIVA7PpYCODg8VMc6jrJqyWbvTglwG41GMY3XHAe+7ytj2u22sqTahKyOQBajlMZWY570nMT/hoDv+7GZsca9UXTVFvnaCARBANd1Ydl29oVtHQTCMBQuaqpmTlWFVkqAUhrrheYhMYuYZdurISCrJqrRtQjBbqmkvH4lBIIgQME0hXJIVhTP82ILW7fbVc7MSiQka+Q4iIJpwvM8YWy3211vFQrDcDLyMrm4riuNrzmOdNOzkirUOjtTJm1hRkscJSAaAGvZBKK9TBYJzNpHLH0Gvjo4UI/gjCqy9pXYHrfSye0g91K5LI190WrNXI11w8DNzc3yCHxTrSofnjPEu6owDGfuyPhgPK5Wl0dgVg7wMholQSmdks6sliLt1nJuAr7vzyUDTkRWLkXfR724tbUcAgBib+BkMkjjopi0byhSEfA8by7wMpm4rovi1pb0ut1SKfWbutTNXDKZZT1RFFzBNPGi1QIgl+LB4WGm14yZ2mnXdZWVJUrKIgRBEMTik2U164Y+MwGAbexd14VFyGRvwFsKmxA8rlbR6/Wk8e12GzYhyv4Jf3eY9zvAP+I1Ik5g2AP+/D4ToTuz/ivg8kugrjFvjL2uMXwJixMY9NjF7T3gXfpVcWEb9BjQi33g8gvg+gnQOfpIpv9qKmRaQn/9CDTzjMjVkXTqVmoX+4zAu2DqT+IcGPYYCc58lURuQzbyzTybBYB9buaFl8uTeNADzrcnJD7Ux9L6o8kectd281NcLg2NPYvLqvO1KOq9BqAvveltyG7KkyiaVBd7wPVToS7nskGPAbw6App5NkD8/s08IwQAv56w78QK+E0D8N3Mh/G8qGvxGWlEHvryASP15hEjdv0k4U+ZJNp7QCMRH/3c3otr/WKfxYvtmQZgf64Ruw0ZiOf5j7MQ9boATOLvH5KzGL325QNxCVfn3g7/T+X8PSxPsuf5acB1BeDkddzPt7OuPV7yiMEw9S144jXzUzMxBT76+/k2GwTBwjSn9ZE8cgBgB4scNRj8wnKF671zxPT8epwT/glL+MUr2FsAn8nOS9wH8POiT1ii/QBgY55TK2WwIy4U6z0AMhxjqCF5wGNs/wEm1A75lp2QYwAAAABJRU5ErkJggg==",
			"https://www.ebay.com/favicon.ico"                          : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAuElEQVQ4jWNgwAKuX7+uFhgYuJaPj+8DHx/fh8DAwLXXr19Xw6YWq2YxMbEX7e3t5e/eveN/9+4df3t7e7mYmNgLogwJDAxc297eXo4u3t7eXh4YGLiWoAF8fHwftm/f7o4uvnXrVg8+Pr4PWDU9NbL4D8MMKZdQ8Nf1TP+/rmf6/2UdhG7bIQ7HJBkAw6MGjBqA04BnHj6PSTVg0n79x3ADvh875QwzhBgDJu3Xf3zn9QFHBgYGBgBTkbt/nS2hPQAAAABJRU5ErkJggg==",
			"https://translate.google.com/favicon.ico"                  : "data:image/png;base64,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",
		}
	};

	if (DEBUG) { log("Startup time is: " + new Date().toLocaleString()); }

	let isFirstLoad: boolean = true;
	let browserVersion: number = 0;
	const sss: SSS = new SSS();

	// show message on installation
	browser.runtime.onInstalled.addListener(details => {
		if (details.reason == "install") {
			browser.tabs.create({ url: "/res/msg-pages/sss-intro.html" });
		}
	});

	// get browser version and then startup
	browser.runtime.getBrowserInfo().then(browserInfo => {
		browserVersion = parseInt(browserInfo.version.split(".")[0]);
		if (DEBUG) { log("Firefox is version " + browserVersion); }

		// Clear all settings (for test purposes only).
		// Since the mistake from version 3.43.0, "removeToUse" was added to the call
		// and the add-on submission script (not included in the repository) now
		// checks for calls to the clear() function.

		// browser.storage.local.cle_removeToUse_ar();
		// browser.storage.sync.cle_removeToUse_ar();

		// register with content script messages and changes to settings
		browser.runtime.onMessage.addListener(onContentScriptMessage);
		browser.storage.onChanged.addListener(onSettingsChanged);

		// Get settings. Setup happens when they are ready.
		browser.storage.local.get().then(onSettingsAcquired, getErrorHandler("Error getting settings for setup."));
	});

	/* ------------------------------------ */
	/* -------------- SETUP --------------- */
	/* ------------------------------------ */

	// Main SSS setup. Called when settings are acquired. Prepares everything.
	function onSettingsAcquired(settings: Settings)
	{
		let doSaveSettings = false;

		// If settings object is empty, use defaults.
		if (settings === undefined || isObjectEmpty(settings)) {
			if (DEBUG) { log("Empty settings! Using defaults."); }
			settings = defaultSettings;	// not a copy, but we will exit this function right after
			doSaveSettings = true;
		} else if (isFirstLoad) {
			doSaveSettings = runBackwardsCompatibilityUpdates(settings);
		}

		if (doSaveSettings) {
			browser.storage.local.set(settings);
			return;	// calling "set" will trigger this whole function again, so quit before wasting time
		}

		uniqueIdToEngineDictionary = {};
		for (const engine of settings.searchEngines) {
			uniqueIdToEngineDictionary[engine.uniqueId] = engine;
		}

		// save settings and also keep subsets of them for content-script-related purposes
		sss.settings = settings;
		sss.activationSettingsForContentScript = getActivationSettingsForContentScript(settings);
		sss.settingsForContentScript = getPopupSettingsForContentScript(settings);
		sss.blockedWebsitesCache = buildBlockedWebsitesCache(settings.websiteBlocklist);

		if (isFirstLoad) {
			if (DEBUG) { log("loading ", settings); }
		}

		setup_ContextMenu();
		setup_Commands();
		setup_Popup();

		if (isFirstLoad) {
			if (DEBUG) { log("Swift Selection Search has started!"); }
			isFirstLoad = false;
		}
	}

	// small subset of settings needed for activating content scripts (no need to pass everything if the popup isn't ever called)
	function getActivationSettingsForContentScript(settings: Settings): ActivationSettings
	{
		const activationSettings = new ActivationSettings();
		activationSettings.useEngineShortcutWithoutPopup = settings.useEngineShortcutWithoutPopup;
		activationSettings.popupLocation = settings.popupLocation;
		activationSettings.popupOpenBehaviour = settings.popupOpenBehaviour;
		activationSettings.middleMouseSelectionClickMargin = settings.middleMouseSelectionClickMargin;
		activationSettings.popupDelay = settings.popupDelay;
		activationSettings.browserVersion = browserVersion;
		return activationSettings;
	}

	// settings for when a content script needs to show the popup
	function getPopupSettingsForContentScript(settings: Settings): ContentScriptSettings
	{
		const contentScriptSettings = new ContentScriptSettings();
		contentScriptSettings.settings = Object.assign({}, settings);	// shallow copy
		contentScriptSettings.settings.searchEngines = settings.searchEngines.filter(engine => engine.isEnabled);	// pass only enabled engines
		contentScriptSettings.settings.searchEnginesCache = {};
		contentScriptSettings.sssIcons = sssIcons;	// add information about special SSS icons (normally not in settings because it doesn't change)

		// get icon cache for enabled engines
		for (const engine of contentScriptSettings.settings.searchEngines)
		{
			if (engine.type !== SearchEngineType.SSS)
			{
				const iconCache: string = settings.searchEnginesCache[(engine as SearchEngine_Custom).iconUrl];
				if (iconCache) {
					contentScriptSettings.settings.searchEnginesCache[(engine as SearchEngine_Custom).iconUrl] = iconCache;
				}
			}
		}
		return contentScriptSettings;
	}

	// Builds an array of regular expressions based on the websites in the blocklist.
	// This makes it easier to just match the regex and a part of the URL later.
	function buildBlockedWebsitesCache(websitesBlocklistText: string): RegExp[]
	{
		websitesBlocklistText = websitesBlocklistText.trim();

		const websites: string[] = websitesBlocklistText.split("\n");
		const websiteRegexes: RegExp[] = [];

		for (let i = 0; i < websites.length; i++)
		{
			const website: string = websites[i].trim();
			if (website.length == 0) continue;

			let regexStr: string;

			if (website.startsWith("/") && website.endsWith("/"))
			{
				regexStr = website.substr(1, website.length-2);	// string without the / /
			}
			else if (website.includes("*"))
			{
				regexStr = escapeRegexString(website);
				regexStr = "^" + regexStr.replace("\\*", "(.*?)");	// ^ matches start of string, * are replaced by a non greedy match for "any characters"
			}
			else
			{
				regexStr = "^" + escapeRegexString(website);	// ^ matches start of string
			}

			try {
				const regex = new RegExp(regexStr);
				websiteRegexes.push(regex);
			} catch (e) {
				console.warn("[WARNING] [Swift Selection Search]\nRegex parse error in \"Website blocklist\". Problematic regex is:\n\n\t" + website + "\n\n" + e);
			}
		}

		return websiteRegexes;
	}

	function escapeRegexString(str: string): string
	{
		return str.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched str
	}

	// Adds settings that were not available in older versions of SSS to the settings object.
	// For simplicity, all other code in SSS assumes that all settings exist and have a value.
	// This method ensures it, regardless of what SSS version the user last changed settings at.
	function runBackwardsCompatibilityUpdates(settings: Settings): boolean
	{
		let shouldSave: boolean = false;

		// in the comments you can see the first version of SSS where the setting was included
		if (createSettingIfNonExistent(settings, "popupItemVerticalPadding"))             shouldSave = true; // 3.1.0
		if (createSettingIfNonExistent(settings, "allowPopupOnEditableFields"))           shouldSave = true; // 3.6.0
		if (createSettingIfNonExistent(settings, "popupBorderRadius"))                    shouldSave = true; // 3.9.1
		if (createSettingIfNonExistent(settings, "popupItemBorderRadius"))                shouldSave = true; // 3.12.0
		if (createSettingIfNonExistent(settings, "minSelectedCharacters"))                shouldSave = true; // 3.13.0
		if (createSettingIfNonExistent(settings, "middleMouseSelectionClickMargin"))      shouldSave = true; // 3.14.1
		if (createSettingIfNonExistent(settings, "hidePopupOnRightClick"))                shouldSave = true; // 3.15.0
		if (createSettingIfNonExistent(settings, "popupSeparatorWidth"))                  shouldSave = true; // 3.21.0
		if (createSettingIfNonExistent(settings, "popupOpenCommand"))                     shouldSave = true; // 3.22.0
		if (createSettingIfNonExistent(settings, "popupDisableCommand"))                  shouldSave = true; // 3.22.0
		if (createSettingIfNonExistent(settings, "iconAlignmentInGrid"))                  shouldSave = true; // 3.25.0
		if (createSettingIfNonExistent(settings, "popupDelay"))                           shouldSave = true; // 3.29.0
		if (createSettingIfNonExistent(settings, "maxSelectedCharacters"))                shouldSave = true; // 3.30.0
		if (createSettingIfNonExistent(settings, "contextMenuString"))                    shouldSave = true; // 3.32.0
		if (createSettingIfNonExistent(settings, "showSelectionTextField"))               shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "useCustomPopupCSS"))                    shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "customPopupCSS"))                       shouldSave = true; // 3.40.0
		if (createSettingIfNonExistent(settings, "selectionTextFieldLocation"))           shouldSave = true; // 3.41.0
		if (createSettingIfNonExistent(settings, "websiteBlocklist"))                     shouldSave = true; // 3.42.0
		if (createSettingIfNonExistent(settings, "useDarkModeInOptionsPage"))             shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "mouseRightButtonBehaviour"))            shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "contextMenuItemRightButtonBehaviour"))  shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "contextMenuItemMiddleButtonBehaviour")) shouldSave = true; // 3.43.0
		if (createSettingIfNonExistent(settings, "searchEngineIconsSource"))              shouldSave = true; // 3.44.0
		if (createSettingIfNonExistent(settings, "shortcutBehaviour"))                    shouldSave = true; // 3.46.0
		if (createSettingIfNonExistent(settings, "useEngineShortcutWithoutPopup"))        shouldSave = true; // 3.46.0

		// 3.7.0
		// convert old unchangeable browser-imported engines to normal ones
		for (const engine of settings.searchEngines)
		{
			if (engine.type === SearchEngineType.BrowserLegacy)
			{
				// a BrowserLegacy engine was essentially an old Custom engine with an id and iconSrc
				const customEngine = engine as SSS.SearchEngine_Custom;

				if (customEngine.iconUrl === undefined) {
					customEngine.iconUrl = customEngine["iconSrc"];
					delete customEngine["iconSrc"];
					delete customEngine["id"];
				}

				// just say that BrowserLegacy is a Custom engine from now on, since they are equivalent at this point
				customEngine.type = SearchEngineType.Custom;	// 3.47.0 (this specific line only)
				shouldSave = true;
			}
		}

		// 3.25.0
		// add isEnabledInContextMenu to all engines
		for (const engine of settings.searchEngines)
		{
			if (engine.isEnabledInContextMenu === undefined) {
				engine.isEnabledInContextMenu = engine.type !== SearchEngineType.SSS && (engine.isEnabled || settings.contextMenuEnginesFilter === ContextMenuEnginesFilter.All);
				shouldSave = true;
			}
		}

		// 3.47.0
		for (const engine of settings.searchEngines) {
			if (engine.uniqueId === undefined) {
				engine.uniqueId = generateUniqueEngineId(engine);
				shouldSave = true;
			}
		}

		return shouldSave;
	}

	function createSettingIfNonExistent(settings: Settings, settingName: string): boolean
	{
		if (settings[settingName] === undefined) {
			settings[settingName] = defaultSettings[settingName];
			return true;
		}
		return false;
	}

	// Generates a unique string ID to be used for an engine, and stores the engine in the IDs dictionary (if engine is provided).
	function generateUniqueEngineId(engine: SearchEngine = null): string
	{
		let uniqueId: string = null;
		let isUnique = false;

		// generate until unique (first try almost every time)
		while (!isUnique)
		{
			uniqueId = Math.random().toString(36).substring(2);	// substring(2) removes "0." from start
			isUnique = uniqueIdToEngineDictionary[uniqueId] === undefined;
		}

		if (engine !== null) {
			uniqueIdToEngineDictionary[uniqueId] = engine;
		}

		return uniqueId;
	}

	// whenever settings change, we re-aquire all settings and setup everything again as if just starting
	// (definitely not performant, but very robust)
	function onSettingsChanged(changes: object, area: string)
	{
		if (area !== "local" || isObjectEmpty(changes)) return;

		if (DEBUG) { log("onSettingsChanged in " + area); }
		if (DEBUG) { log(changes); }

		browser.storage.local.get()
			.then(onSettingsAcquired, getErrorHandler("Error getting settings after onSettingsChanged."))
			.then(updateSettingsOnAllTabs, getErrorHandler("Error updating settings on all tabs."));
	}

	function updateSettingsOnAllTabs()
	{
		browser.tabs.query({}).then(tabs => {
			for (const tab of tabs) {
				activateTab(tab);
			}
		}, getErrorHandler("Error querying tabs."));
	}

	function activateTab(tab: browser.tabs.Tab)
	{
		browser.tabs.sendMessage(tab.id, {
			type: "activate",
			activationSettings: sss.activationSettingsForContentScript,
			isPageBlocked: isPageBlocked(tab),
		}).then(() => {}, () => {});	// suppress errors
	}

	function isPageBlocked(tab: browser.tabs.Tab): boolean
	{
		if (sss.blockedWebsitesCache === undefined) return false;	// can happen when reloading extension in about:debugging
		if (sss.blockedWebsitesCache.length == 0) return false;
		if (!tab.url) return false;	// tab.url is undefined if we don't have the "tabs" permission

		// NOTE: This indexOf assumes that if :// is present, it's right after the protocol, but here's a valid URL that breaks this:
		// "es:some text like http://abc.com" ("es" is the protocol used by the search tool Everything).
		const index = tab.url.indexOf("://");
		const url: string = index >= 0 ? tab.url.substr(index + 3) : tab.url;

		for (const regex of sss.blockedWebsitesCache)
		{
			if (url.match(regex)) {
				if (DEBUG) { log("regex " + regex + " matches this URL. BLOCKED " + url); }
				return true;
			}
		}

		return false;
	}

	// default error handler for promises
	function getErrorHandler(text: string): (reason: any) => void
	{
		if (DEBUG) {
			return error => { log(`${text} (${error})`); };
		} else {
			return undefined;
		}
	}

	function isObjectEmpty(obj: object): boolean
	{
		for (let _ in obj) {
			return false;	// has at least one element
		}
		return true;
	}

	// act when a content script requests something from this script
	function onContentScriptMessage(msg, sender, callbackFunc)
	{
		if (DEBUG) {
			if (msg.type !== "log") {
				log("msg.type: " + msg.type);
			}
		}

		switch (msg.type)
		{
			// messages from content script

			case "getPopupSettings":
				callbackFunc(sss.settingsForContentScript);
				break;

			case "engineClick":
				onSearchEngineClick(msg.engine, msg.openingBehaviour, msg.selection, msg.href, null);
				break;

			case "log":
				if (DEBUG) { log("[content script log]", msg.log); }
				break;

			// messages from settings page

			case "getDataForSettingsPage":
				callbackFunc({
					DEBUG: DEBUG,
					browserVersion: browserVersion,
					sssIcons: sssIcons,
					defaultSettings: defaultSettings
				});
				break;

			case "runBackwardsCompatibilityUpdates":
				runBackwardsCompatibilityUpdates(msg.settings);
				callbackFunc(msg.settings);
				break;

			case "generateUniqueEngineId":
				// Generate an ID but don't provide any engine since this message happens for engines currently being created in the settings menu.
				// After the engine is created, the settings will be saved and we'll regenerate the IDs dictionary then.
				callbackFunc(generateUniqueEngineId());
				break;

			default: break;
		}
	}

	function createDefaultEngine(engine) : SearchEngine
	{
		engine.uniqueId = generateUniqueEngineId(engine);

		if (engine.type === undefined) {
			engine.type = SearchEngineType.Custom;
		}

		if (engine.isEnabled === undefined) {
			engine.isEnabled = true;
		}

		if (engine.isEnabledInContextMenu === undefined) {
			engine.isEnabledInContextMenu = engine.isEnabled;
		}

		return engine;
	}

	/* ------------------------------------ */
	/* ----------- CONTEXT MENU ----------- */
	/* ------------------------------------ */

	function setup_ContextMenu()
	{
		// cleanup first
		browser.contextMenus.onClicked.removeListener(onContextMenuItemClicked);
		browser.contextMenus.removeAll();

		if (sss.settings.enableEnginesInContextMenu !== true) return;

		// define parent menu
		browser.contextMenus.create({
			id: "sss",
			title: sss.settings.contextMenuString,
			contexts: ["selection"/* , "link" */],
			// The code in onContextMenuItemClicked already allows SSS to search by a link's text by right clicking it,
			// so uncommenting the above "link" context would magically add this feature. However, by default, SSS's
			// contextMenuString uses %s, which Firefox replaces ONLY with the currently selected text, MEANING that if you just
			// right click a link with nothing selected, the context menu would just say [Search for “%s”] with a literal %s.
			// Since this feels dumb, the feature is commented-out for now.
		});

		const engines: SearchEngine[] = sss.settings.searchEngines;

		// define sub options (one per engine)
		for (let i = 0; i < engines.length; i++)
		{
			const engine = engines[i];
			if (!engine.isEnabledInContextMenu) continue;

			const contextMenuOption = {
				id: undefined,
				title: undefined,
				type: undefined,
				parentId: "sss",
				icons: undefined,
			};

			if (engine.type === SearchEngineType.SSS) {
				const concreteEngine = engine as SearchEngine_SSS;
				if (concreteEngine.id === "separator") {
					contextMenuOption.type = "separator";
					browser.contextMenus.create(contextMenuOption);
					continue;
				}
				contextMenuOption.title = sssIcons[concreteEngine.id].name;
			} else {
				const concreteEngine = engine as SearchEngine_Custom;
				contextMenuOption.title = concreteEngine.name;
			}

			let icon: string;

			if (engine.type === SearchEngineType.SSS) {
				const concreteEngine = engine as SearchEngine_SSS;
				icon = sssIcons[concreteEngine.id].iconPath;
			}
			else {
				const iconUrl: string = (engine as SearchEngine_NonSSS).iconUrl;

				if (iconUrl.startsWith("data:")) {
					icon = iconUrl;
				} else {
					icon = sss.settings.searchEnginesCache[iconUrl];
					if (icon === undefined) {
						icon = iconUrl;
					}
				}
			}

			contextMenuOption.icons = { "32": icon };

			contextMenuOption.id = "" + i;
			browser.contextMenus.create(contextMenuOption);
		}

		browser.contextMenus.onClicked.addListener(onContextMenuItemClicked);
	}

	function onContextMenuItemClicked(info: browser.contextMenus.OnClickData, tab: browser.tabs.Tab)
	{
		const menuId: number = parseInt(info.menuItemId as string);
		const selectedEngine: SearchEngine = sss.settings.searchEngines[menuId];
		const button = info?.button ?? 0;
		onSearchEngineClick(selectedEngine, getOpenResultBehaviourForContextMenu(button), info.selectionText ?? info.linkText, info.pageUrl, info.linkText);
	}

	function getOpenResultBehaviourForContextMenu(button: number)
	{
		if (button === 0) return sss.settings.contextMenuItemBehaviour;
		if (button === 1) return sss.settings.contextMenuItemMiddleButtonBehaviour;
		/* if (button === 2)  */return sss.settings.contextMenuItemRightButtonBehaviour;
	}

	/* ------------------------------------ */
	/* ------------ SHORTCUTS ------------- */
	/* ------------------------------------ */

	function setup_Commands()
	{
		// clear any old registrations
		if (browser.commands.onCommand.hasListener(onCommand)) {
			browser.commands.onCommand.removeListener(onCommand);
		}

		// register keyboard shortcuts
		if (sss.settings.popupOpenBehaviour !== PopupOpenBehaviour.Off) {
			browser.commands.onCommand.addListener(onCommand);
		}

		updateCommand("open-popup", sss.settings.popupOpenCommand);
		updateCommand("toggle-auto-popup", sss.settings.popupDisableCommand);

		function updateCommand(name, shortcut)
		{
			shortcut = shortcut.trim();

			try {
				browser.commands.update({ name: name, shortcut: shortcut });
			} catch {
				// Since WebExtensions don't provide a way (that I know of) to simply disable a shortcut,
				// if the combination is invalid pick something that is reserved for the browser and so won't work.
				browser.commands.update({ name: name, shortcut: "Ctrl+P" });
			}
		}
	}

	function onCommand(command: string)
	{
		switch (command)
		{
			case "open-popup":        onOpenPopupCommand(); break;
			case "toggle-auto-popup": onToggleAutoPopupCommand(); break;
		}
	}

	function onOpenPopupCommand()
	{
		if (DEBUG) { log("open-popup"); }
		getActiveTab().then(tab => browser.tabs.sendMessage(tab.id, { type: "showPopup" }));
	}

	function onToggleAutoPopupCommand()
	{
		if (DEBUG) { log("toggle-auto-popup, sss.settings.popupOpenBehaviour: " + sss.settings.popupOpenBehaviour); }

		// toggles value between Auto and Keyboard
		if (sss.settings.popupOpenBehaviour === PopupOpenBehaviour.Auto) {
			browser.storage.local.set({ popupOpenBehaviour: PopupOpenBehaviour.Keyboard });
		} else if (sss.settings.popupOpenBehaviour === PopupOpenBehaviour.Keyboard) {
			browser.storage.local.set({ popupOpenBehaviour: PopupOpenBehaviour.Auto });
		}
	}

	/* ------------------------------------ */
	/* -------------- POPUP --------------- */
	/* ------------------------------------ */

	function setup_Popup()
	{
		// remove eventual previous registrations
		browser.webNavigation.onDOMContentLoaded.removeListener(onDOMContentLoaded);

		// If the user has set the option to always use the engine shortcuts, we inject the script
		// even if the opening behaviour of the popup is set to Off (never).
		if (sss.settings.popupOpenBehaviour !== PopupOpenBehaviour.Off || sss.settings.useEngineShortcutWithoutPopup) {
			// register page load event and try to add the content script to all open pages
			browser.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);
			browser.tabs.query({}).then(installOnOpenTabs, getErrorHandler("Error querying tabs."));
		}

		if (browser.webRequest)
		{
			registerCSPModification();
		}
	}

	function onDOMContentLoaded(details)
	{
		injectContentScript(details.tabId, details.frameId, false);
	}

	function installOnOpenTabs(tabs: browser.tabs.Tab[])
	{
		if (DEBUG) { log("installOnOpenTabs"); }

		for (const tab of tabs) {
			injectContentScriptIfNeeded(tab.id, undefined, true);	// inject on all frames if possible
		}
	}

	function injectContentScriptIfNeeded(tabId: number, frameId?: number, allFrames: boolean = false)
	{
		// try sending message to see if content script exists. if it errors then inject it
		browser.tabs.sendMessage(tabId, { type: "isAlive" }).then(
			msg => {
				if (msg === undefined) {
					injectContentScript(tabId, frameId, allFrames);
				}
			},
			() => injectContentScript(tabId, frameId, allFrames)
		);
	}

	function injectContentScript(tabId: number, frameId?: number, allFrames: boolean = false)
	{
		if (DEBUG) { log("injectContentScript " + tabId + " frameId: " + frameId + " allFrames: " + allFrames); }

		const errorHandler = getErrorHandler(`Error injecting page content script in tab ${tabId}.`);

		const executeScriptOptions: browser.extensionTypes.InjectDetails = {
			runAt: "document_start",
			frameId: frameId,
			allFrames: allFrames,
			file: undefined,
			code: undefined,
		};

		// Save function for either calling it as a callback to another function (1), or as its own call (2).
		const injectPageScript = () => {
			executeScriptOptions.file = "/content-scripts/selectionchange.js";
			browser.tabs.executeScript(tabId, executeScriptOptions).then(() => {
				executeScriptOptions.file = "/content-scripts/page-script.js";
				browser.tabs.executeScript(tabId, executeScriptOptions)
					.then(() => browser.tabs.get(tabId).then(activateTab), errorHandler)
			}, errorHandler);
		};

		// The DEBUG variable is also passed if true, so we only have to declare debug mode once: at the top of this background script.
		if (DEBUG) {
			executeScriptOptions.code = "var DEBUG_STATE = " + DEBUG + ";",
			browser.tabs.executeScript(tabId, executeScriptOptions).then(injectPageScript, errorHandler);	// (1) callback to another function
			executeScriptOptions.code = undefined;	// remove "code" field from object
		} else {
			injectPageScript();	// (2) own call
		}
	}

	/* ------------------------------------ */
	/* ------- HEADER MODIFICATION -------- */
	/* ------------------------------------ */

	// Some pages have a restrictive CSP that blocks things, but extensions can modify the CSP to allow their own modifications
	// (as long as they have the needed permissions). In particular, SSS needs to use inline style blocks.
	function registerCSPModification()
	{
		browser.webRequest.onHeadersReceived.removeListener(modifyCSPRequest);

		if (DEBUG) { log("registering with onHeadersReceived"); }

		browser.webRequest.onHeadersReceived.addListener(
			modifyCSPRequest,
			{ urls : [ "http://*/*", "https://*/*" ], types: [ "main_frame" ] },
			[ "blocking", "responseHeaders" ]
		);
	}

	function modifyCSPRequest(details)
	{
		for (const responseHeader of details.responseHeaders)
		{
			const headerName = responseHeader.name.toLowerCase();
			if (headerName !== "content-security-policy" && headerName !== "x-webkit-csp") continue;

			const CSP_SOURCE = "style-src ";	// the trailing space is important, otherwise we also match things like "style-src-attr" or "style-src-elem"

			if (responseHeader.value.includes(CSP_SOURCE))
			{
				if (DEBUG) { log("CSP is: " + responseHeader.value); }
				responseHeader.value = responseHeader.value.replace(CSP_SOURCE, CSP_SOURCE + "'unsafe-inline' ");
				if (DEBUG) { log("modified CSP to include style-src 'unsafe-inline': " + responseHeader.value); }
			}
		}

		return details;
	}

	/* ------------------------------------ */
	/* ---------- ENGINE CLICKS ----------- */
	/* ------------------------------------ */

	async function onSearchEngineClick(
		selectedEngine: SearchEngine,
		openingBehaviour: OpenResultBehaviour,
		searchText: string,
		href: string,
		linkText: string)
	{
		// Check if it's a special SSS engine (engine groups never contain these).

		if (selectedEngine.type === SearchEngineType.SSS)
		{
			const engine_SSS = selectedEngine as SearchEngine_SSS;

			if (engine_SSS.id === "copyToClipboard") {
				// Only assume link if the searchText is the link text.
				// This prioritizes selection over link (since it shows on the "%s" part of the SSS context menu and causes confusion).
				if (searchText === linkText) {
					navigator.clipboard.writeText(linkText);	// if copying a link, just always copy its text
				} else {
					copyToClipboard(selectedEngine as SearchEngine_SSS_Copy);	// copy in the page script, to allow choice between HTML and plain text copy
				}
			}
			else if (engine_SSS.id === "openAsLink") {
				const url: string = getOpenAsLinkSearchUrl(searchText);
				await createTabForSearch(openingBehaviour, 0, url);
				if (DEBUG) { log("open as link: " + url); }
			}

			return;
		}

		// Prepare a list of all engines to search (even if only one).

		let engines: SearchEngine[];

		if (selectedEngine.type === SearchEngineType.Group)
		{
			// Recursively collects all engines in the group, including engines inside infinitely nested groups.
			function fillWithGroupEngines(expandedEngines: SearchEngine[], groupEngine: SearchEngine_Group)
			{
				for (const engineId of (groupEngine as SearchEngine_Group).enginesUniqueIds)
				{
					const engine = uniqueIdToEngineDictionary[engineId];
					if (engine.type === SearchEngineType.Group) {
						fillWithGroupEngines(expandedEngines, engine as SearchEngine_Group);
					} else {
						expandedEngines.push(engine);
					}
				}
			}

			engines = [];
			fillWithGroupEngines(engines, selectedEngine as SearchEngine_Group);
		}
		else
		{
			engines = [selectedEngine];	// single element list, to reuse the for-cycle used for groups
		}

		// Go through all engines in the list and search using each of them.

		let tabIndexOffset: number = 0;

		for (let i = 0; i < engines.length; i++)
		{
			const engine = engines[i];

			// For the second engine in the group onward, we change the opening behaviour
			// so that the engines open after the first in a way that makes sense.
			if (i == 1)
			{
				switch (openingBehaviour)
				{
					case OpenResultBehaviour.ThisTab:            openingBehaviour = OpenResultBehaviour.NewBgTabNextToThis; break;
					case OpenResultBehaviour.NewTab:             openingBehaviour = OpenResultBehaviour.NewBgTab; break;
					case OpenResultBehaviour.NewBgTab:           break;
					case OpenResultBehaviour.NewTabNextToThis:   openingBehaviour = OpenResultBehaviour.NewBgTabNextToThis; break;
					case OpenResultBehaviour.NewBgTabNextToThis: break;
					case OpenResultBehaviour.NewWindow:          openingBehaviour = OpenResultBehaviour.NewBgTabNextToThis; break;
					case OpenResultBehaviour.NewBgWindow:        openingBehaviour = OpenResultBehaviour.NewBgTabNextToThis; break;
				}
			}

			// check if it's a custom engine
			if (engine.type === SearchEngineType.Custom)
			{
				const engine_Custom = engine as SearchEngine_Custom;
				let openingBehaviourBeforeDiscard: OpenResultBehaviour;

				if (engine_Custom.discardOnOpen) {
					// To be able to discard we need to open the URL in a new tab, regardless of opening behaviour choice.
					// We'll discard the tab when it finishes opening the search.
					openingBehaviourBeforeDiscard = openingBehaviour;
					openingBehaviour = OpenResultBehaviour.NewBgTabNextToThis;
				}

				const query = getSearchQuery(engine_Custom, searchText, new URL(href));
				const tab: browser.tabs.Tab = await createTabForSearch(openingBehaviour, tabIndexOffset, query);

				if (engine_Custom.discardOnOpen) {
					// We wanted to have a way to know that the browser has already changed the URL by this point
					// (especially if for non-http schemes like es:{searchTerms} for the Everything application),
					// in order to close the tab, but sadly that's unknown at the moment.
					// Instead we (UGLYYYY) wait 50ms for the search to hopefully be started.
					await new Promise(finish => setTimeout(finish, 50));
					await browser.tabs.remove(tab.id);

					// Return to normal opening behaviour after discard.
					openingBehaviour = openingBehaviourBeforeDiscard;

					// If opening behaviour was set to NewBgTabNextToThis, the offset will be increased at the end
					// of this iteration, but we removed the tab, so we counter that increase here.
					if (openingBehaviour === OpenResultBehaviour.NewBgTabNextToThis) tabIndexOffset--;
				}
			}
			// check if it's a browser-managed engine
			else if (engine.type === SearchEngineType.BrowserSearchApi)
			{
				const engine_BrowserSearchApi = engine as SearchEngine_BrowserSearchApi;

				// NOTE: Ideally, above we'd like to create a new empty tab with createTabForSearch, and then always
				// call browser.search.search() on that tab.id, which would magically support every opening behaviour.
				// However, life is sad and another addon can modify the "new tab" page. That would cause a race
				// condition with this code when it tries to load the search URL. Only one or the other would work.

				// Because of that, we comment this out and resort to the old way that only supports ThisTab or NewTab.
				// const tab: browser.tabs.Tab = await getTabForSearch(openingBehaviour, tabIndexOffset);

				const tab: browser.tabs.Tab = await getActiveTab();

				await browser.search.search({
					engine: engine_BrowserSearchApi.name,
					query: cleanSearchText(searchText),
					// we want all open behaviours that are not "ThisTab" to open in another tab
					tabId: openingBehaviour === OpenResultBehaviour.ThisTab ? tab.id : undefined,
					// tabId: tab.id	// could be simply this if it wasn't for the big explanation above
				});
			}

			// if we've just opened a background tab next to the active one, make sure subsequent tabs open further away each time
			if (openingBehaviour === OpenResultBehaviour.NewBgTabNextToThis) tabIndexOffset++;
		}
	}

	function copyToClipboard(engine: SearchEngine_SSS_Copy)
	{
		if (engine.isPlainText) {
			copyToClipboardAsPlainText();
		} else {
			copyToClipboardAsHtml();
		}
	}

	function copyToClipboardAsHtml()
	{
		getActiveTab().then(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboardAsHtml" }));
	}

	function copyToClipboardAsPlainText()
	{
		getActiveTab().then(tab => browser.tabs.sendMessage(tab.id, { type: "copyToClipboardAsPlainText" }));
	}

	function getOpenAsLinkSearchUrl(link: string): string
	{
		// trim text and add http protocol as default if selected text doesn't have it
		link = link.trim();

		if (!link.includes("://") && !link.startsWith("about:")) {
			link = "http://" + link;
		}

		return link;
	}

	function cleanSearchText(searchText: string): string
	{
		return searchText.trim().replace("\r\n", " ").replace("\n", " ");
	}

	// gets the complete search URL by applying the selected text to the engine's own searchUrl
	function getSearchQuery(engine: SearchEngine_Custom, searchText: string, url: URL): string
	{
		searchText = cleanSearchText(searchText);

		const hasCustomEncoding = engine.encoding && engine.encoding !== "utf8";
		if (hasCustomEncoding) {
			// encode to bytes, then convert bytes to hex and add % before each pair of characters (so it can be used in the URL)
			const buffer = iconv.encode(searchText, engine.encoding);
			searchText = "%" + buffer.toString("hex").toUpperCase().replace(/([A-Z0-9]{2})\B/g, "$1%");
		}

		let query = engine.searchUrl;

		// https://developer.mozilla.org/en-US/docs/Web/API/URL#Properties
		// NOTE: regex "i" flag ignores case
		if (/\{hash/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "hash",     url.hash,     false); }
		if (/\{hostname/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "hostname", url.hostname, false); }	// must be replaced before "host"
		if (/\{host/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "host",     url.host,     false); }
		if (/\{href/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "href",     url.href,     false); }
		if (/\{origin/i.test(query))   { query = SearchVariables.modifySearchVariable(query, "origin",   url.origin,   false); }
		if (/\{password/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "password", url.password, false); }
		if (/\{pathname/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "pathname", url.pathname, false); }
		if (/\{port/i.test(query))     { query = SearchVariables.modifySearchVariable(query, "port",     url.port,     false); }
		if (/\{protocol/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "protocol", url.protocol, false); }
		if (/\{search/i.test(query))   { query = SearchVariables.modifySearchVariable(query, "search",   url.search,   false); }
		if (/\{username/i.test(query)) { query = SearchVariables.modifySearchVariable(query, "username", url.username, false); }

		query = SearchVariables.modifySearchVariable(query, "searchTerms", searchText, !hasCustomEncoding);

		return query;
	}

	// Creates/reuses a tab based on the opening behaviour, to be used for a search (the search is done automatically if searchUrl is not null).
	async function createTabForSearch(openingBehaviour: OpenResultBehaviour, tabIndexOffset: number, searchUrl: string = null): Promise<browser.tabs.Tab>
	{
		const tab: browser.tabs.Tab = await getActiveTab();

		const lastTabIndex: number = 9999;	// "guarantees" tab opens as last for some behaviours
		const options: object = {};

		if (searchUrl !== null) {
			options["url"] = searchUrl
		}

		if (openingBehaviour !== OpenResultBehaviour.ThisTab
		 && openingBehaviour !== OpenResultBehaviour.NewWindow
		 && openingBehaviour !== OpenResultBehaviour.NewBgWindow)
		{
			options["openerTabId"] = tab.id;	// This makes tabs "children" of other tabs, which is useful for tab managing addons like Tree Style Tab.
		}

		switch (openingBehaviour)
		{
			case OpenResultBehaviour.ThisTab:
				if (searchUrl !== null) {
					await browser.tabs.update(tab.id, options);
				}
				return tab;	// doesn't actually create a tab, just returns the active one

			case OpenResultBehaviour.NewTab:
				options["index"] = lastTabIndex + 1;
				return browser.tabs.create(options);

			case OpenResultBehaviour.NewBgTab:
				options["index"] = lastTabIndex + 1;
				options["active"] = false;
				return browser.tabs.create(options);

			case OpenResultBehaviour.NewTabNextToThis:
				options["index"] = tab.index + 1 + tabIndexOffset;
				return browser.tabs.create(options);

			case OpenResultBehaviour.NewBgTabNextToThis:
				options["index"] = tab.index + 1 + tabIndexOffset;
				options["active"] = false;
				return browser.tabs.create(options);

			case OpenResultBehaviour.NewWindow:
				return browser.windows.create(options).then(window => window.tabs[0]);

			case OpenResultBehaviour.NewBgWindow:
				// options["focused"] = false;	// fails because it's unsupported by Firefox
				return browser.windows.create(options).then(window => window.tabs[0]);
		}
	}

	function getActiveTab(): Promise<browser.tabs.Tab>
	{
		return browser.tabs.query({currentWindow: true, active: true}).then(tabs => tabs[0]);
	}
}