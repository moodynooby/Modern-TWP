"use strict";

// get mimetype
var tabToMimeType = {};
chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (details.tabId !== -1) {
      let contentTypeHeader = null;
      for (const header of details.responseHeaders) {
        if (header.name.toLowerCase() === "content-type") {
          contentTypeHeader = header;
          break;
        }
      }
      tabToMimeType[details.tabId] =
        contentTypeHeader && contentTypeHeader.value.split(";", 1)[0];
    }
  },
  {
    urls: ["*://*/*"],
    types: ["main_frame"],
  },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getMainFramePageLanguageState") {
    chrome.tabs.sendMessage(
      sender.tab.id,
      {
        action: "getCurrentPageLanguageState",
      },
      {
        frameId: 0,
      },
      (pageLanguageState) => {
        checkedLastError();
        sendResponse(pageLanguageState);
      }
    );

    return true;
  } else if (request.action === "getMainFrameTabLanguage") {
    chrome.tabs.sendMessage(
      sender.tab.id,
      {
        action: "getOriginalTabLanguage",
      },
      {
        frameId: 0,
      },
      (tabLanguage) => {
        checkedLastError();
        sendResponse(tabLanguage);
      }
    );

    return true;
  } else if (request.action === "setPageLanguageState") {
    updateContextMenu(request.pageLanguageState);
  } else if (request.action === "openOptionsPage") {
    tabsCreate(chrome.runtime.getURL("/options/options.html"));
  } else if (request.action === "detectTabLanguage") {
    if (!sender.tab) {
      // https://github.com/FilipePS/Traduzir-paginas-web/issues/478
      sendResponse("und");
      return;
    }
    try {
      if (
        (platformInfo.isMobile.any && !platformInfo.isFirefox) ||
        (platformInfo.isDesktop.any && platformInfo.isOpera)
      ) {
        chrome.tabs.sendMessage(
          sender.tab.id,
          { action: "detectLanguageUsingTextContent" },
          { frameId: 0 },
          (result) => sendResponse(result)
        );
      } else {
        chrome.tabs.detectLanguage(sender.tab.id, (result) => {
          checkedLastError();
          sendResponse(result);
        });
      }
    } catch (e) {
      console.error(e);
      sendResponse("und");
    }

    return true;
  } else if (request.action === "getTabHostName") {
    sendResponse(new URL(sender.tab.url).hostname);
  } else if (request.action === "thisFrameIsInFocus") {
    chrome.tabs.sendMessage(
      sender.tab.id,
      { action: "anotherFrameIsInFocus" },
      checkedLastError
    );
  } else if (request.action === "getTabMimeType") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse(tabToMimeType[tabs[0].id]);
    });
    return true;
  } else if (request.action === "restorePagesWithServiceNames") {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, request, checkedLastError);
      });
    });
  } else if (request.action == "authorizationToOpenOptions") {
    chrome.storage.local.set({
      authorizationToOpenOptions: request.authorizationToOpenOptions,
    });
  }
});

function updateTranslateSelectedContextMenu() {
  if (typeof chrome.contextMenus !== "undefined") {
    chrome.contextMenus.remove("translate-selected-text", checkedLastError);
    if (twpConfig.get("showTranslateSelectedContextMenu") === "yes") {
      chrome.contextMenus.create({
        id: "translate-selected-text",
        title: twpI18n.getMessage("msgTranslateSelectedText"),
        contexts: ["selection"],
      });
    }
  }
}

function updateContextMenu(pageLanguageState = "original") {
  let contextMenuTitle;
  if (pageLanguageState === "translated") {
    contextMenuTitle = twpI18n.getMessage("btnRestore");
  } else {
    const targetLanguage = twpConfig.get("targetLanguage");
    contextMenuTitle = twpI18n.getMessage(
      "msgTranslateFor",
      twpLang.codeToLanguage(targetLanguage)
    );
  }
  if (typeof chrome.contextMenus != "undefined") {
    chrome.contextMenus.remove("translate-web-page", checkedLastError);
    chrome.contextMenus.remove(
      "translate-restore-this-frame",
      checkedLastError
    );

    if (twpConfig.get("enableIframePageTranslation") === "yes") {
      if (twpConfig.get("showTranslatePageContextMenu") == "yes") {
        chrome.contextMenus.create({
          id: "translate-web-page",
          title: contextMenuTitle,
          contexts: ["page", "frame"],
          documentUrlPatterns: [
            "http://*/*",
            "https://*/*",
            "file://*/*",
            "ftp://*/*",
          ],
        });
      }
    } else {
      if (twpConfig.get("showTranslatePageContextMenu") == "yes") {
        chrome.contextMenus.create({
          id: "translate-web-page",
          title: contextMenuTitle,
          contexts: ["page"],
          documentUrlPatterns: [
            "http://*/*",
            "https://*/*",
            "file://*/*",
            "ftp://*/*",
          ],
        });
      }

      chrome.contextMenus.create({
        id: "translate-restore-this-frame",
        title: twpI18n.getMessage("btnTranslateRestoreThisFrame"),
        contexts: ["frame"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason == "install") {
    tabsCreate(chrome.runtime.getURL("/options/options.html"));
    twpConfig.onReady(async () => {
      if (chrome.i18n.getUILanguage() === "zh-CN") {
        twpConfig.set("pageTranslatorService", "bing");
        twpConfig.set("textTranslatorService", "bing");
      }
    });
  } else if (
    details.reason == "update" &&
    chrome.runtime.getManifest().version != details.previousVersion
  ) {
    twpConfig.onReady(async () => {
      if (platformInfo.isMobile.any) {
        if (details.previousVersion.split(".")[0] === "9") {
          twpConfig.set("neverTranslateLangs", []);
          twpConfig.set("neverTranslateSites", []);
          twpConfig.set("alwaysTranslateLangs", []);
          twpConfig.set("alwaysTranslateSites", []);
        }
        return;
      }
    });
    twpConfig.onReady(async () => {
      translationCache.deleteTranslationCache();
    });
    twpConfig.onReady(async () => {
      twpConfig.set(
        "textTranslatorService",
        twpConfig.get("enabledServices")[0]
      );
    });
    twpConfig.onReady(async () => {
      twpConfig.set("proxyServers", {});
    });
  }

  twpConfig.onReady(async () => {
    if (platformInfo.isMobile.any) {
      const enabledServices = twpConfig.get("enabledServices");
      const index = enabledServices.indexOf("deepl");
      if (index !== -1) {
        enabledServices.splice(index, 1);
        twpConfig.set("enabledServices", enabledServices);
      }
    }
  });
});

function resetPageAction(tabId, forceShow = false) {
  if (!chrome.pageAction) return;
  if (twpConfig.get("translateClickingOnce") === "yes" && !forceShow) {
    chrome.pageAction.setPopup({
      popup: "",
      tabId,
    });
  } else {
    if (twpConfig.get("useOldPopup") === "yes") {
      chrome.pageAction.setPopup({
        popup: "popup/old-popup.html",
        tabId,
      });
    } else {
      chrome.pageAction.setPopup({
        popup: "popup/popup.html",
        tabId,
      });
    }
  }
}

function resetBrowserAction(forceShow = false) {
  if (twpConfig.get("translateClickingOnce") === "yes" && !forceShow) {
    chrome.browserAction.setPopup({
      popup: "",
    });
  } else {
    if (twpConfig.get("useOldPopup") === "yes") {
      chrome.browserAction.setPopup({
        popup: "popup/old-popup.html",
      });
    } else {
      chrome.browserAction.setPopup({
        popup: "popup/popup.html",
      });
    }
  }
}

function sendToggleTranslationMessage(tabId) {
  if (twpConfig.get("enableIframePageTranslation") === "yes") {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: "toggle-translation",
      },
      checkedLastError
    );
  } else {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: "toggle-translation",
      },
      { frameId: 0 },
      checkedLastError
    );
  }
}

function sendTranslatePageMessage(tabId, targetLanguage) {
  if (twpConfig.get("enableIframePageTranslation") === "yes") {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: "translatePage",
        targetLanguage,
      },
      checkedLastError
    );
  } else {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: "translatePage",
        targetLanguage,
      },
      { frameId: 0 },
      checkedLastError
    );
  }
}

if (typeof chrome.contextMenus !== "undefined") {
  const updateActionContextMenu = () => {
    chrome.contextMenus.remove("browserAction-showPopup", checkedLastError);
    chrome.contextMenus.remove("pageAction-showPopup", checkedLastError);
    chrome.contextMenus.remove("never-translate", checkedLastError);
    chrome.contextMenus.remove("more-options", checkedLastError);
    chrome.contextMenus.remove("browserAction-translate-pdf", checkedLastError);
    chrome.contextMenus.remove("pageAction-translate-pdf", checkedLastError);

    chrome.contextMenus.create({
      id: "browserAction-showPopup",
      title: twpI18n.getMessage("btnShowPopup"),
      contexts: ["browser_action"],
    });
    chrome.contextMenus.create({
      id: "pageAction-showPopup",
      title: twpI18n.getMessage("btnShowPopup"),
      contexts: ["page_action"],
    });
    chrome.contextMenus.create({
      id: "never-translate",
      title: twpI18n.getMessage("btnNeverTranslate"),
      contexts: ["browser_action", "page_action"],
    });
    chrome.contextMenus.create({
      id: "more-options",
      title: twpI18n.getMessage("btnMoreOptions"),
      contexts: ["browser_action", "page_action"],
    });
    chrome.contextMenus.create({
      id: "browserAction-translate-pdf",
      title: twpI18n.getMessage("msgTranslatePDF"),
      contexts: ["browser_action"],
    });
    chrome.contextMenus.create({
      id: "pageAction-translate-pdf",
      title: twpI18n.getMessage("msgTranslatePDF"),
      contexts: ["page_action"],
    });
  };
  updateActionContextMenu();

  const tabHasContentScript = {};
  let currentTabId = null;
  chrome.tabs.onActivated.addListener((activeInfo) => {
    currentTabId = activeInfo.tabId;
    updateActionContextMenu();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId == "translate-web-page") {
      const mimeType = tabToMimeType[tab.id];
      if (
        mimeType &&
        mimeType.toLowerCase() === "application/pdf" &&
        chrome.pageAction &&
        chrome.pageAction.openPopup
      ) {
        chrome.pageAction.openPopup();
      } else {
        sendToggleTranslationMessage(tab.id);
      }
    } else if (info.menuItemId == "translate-restore-this-frame") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: "toggle-translation",
          },
          { frameId: info.frameId },
          checkedLastError
        );
      });
    } else if (info.menuItemId == "translate-selected-text") {
      if (
        chrome.pageAction &&
        chrome.pageAction.openPopup &&
        (!tab || !tabHasContentScript[tab.id] || tab.isInReaderMode)
      ) {
        chrome.pageAction.setPopup({
          popup:
            "popup/popup-translate-text.html#text=" +
            encodeURIComponent(info.selectionText),
          tabId: tab?.id || currentTabId,
        });
        chrome.pageAction.openPopup();

        resetPageAction(tab?.id || currentTabId);
      } else {
        // a merda do chrome não suporte openPopup
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: "TranslateSelectedText",
            selectionText: info.selectionText,
          },
          checkedLastError
        );
      }
    } else if (info.menuItemId == "browserAction-showPopup") {
      resetBrowserAction(true);

      if (chrome.browserAction.openPopup) {
        chrome.browserAction.openPopup();
      }

      resetBrowserAction();
    } else if (info.menuItemId == "pageAction-showPopup") {
      resetPageAction(tab.id, true);

      if (chrome.pageAction) {
        chrome.pageAction.openPopup();
      }

      resetPageAction(tab.id);
    } else if (info.menuItemId == "never-translate") {
      const hostname = new URL(tab.url).hostname;
      twpConfig.addSiteToNeverTranslate(hostname);
    } else if (info.menuItemId == "more-options") {
      tabsCreate(chrome.runtime.getURL("/options/options.html"));
    } else if (info.menuItemId == "browserAction-translate-pdf") {
      const mimeType = tabToMimeType[tab.id];
      if (
        mimeType &&
        mimeType.toLowerCase() === "application/pdf" &&
        typeof chrome.browserAction.openPopup !== "undefined"
      ) {
        chrome.browserAction.openPopup();
      } else {
        tabsCreate("https://pdf.translatewebpages.org/");
      }
    } else if (info.menuItemId == "pageAction-translate-pdf") {
      const mimeType = tabToMimeType[tab.id];
      if (
        mimeType &&
        mimeType.toLowerCase() === "application/pdf" &&
        typeof chrome.pageAction.openPopup !== "undefined"
      ) {
        chrome.pageAction.openPopup();
      } else {
        tabsCreate("https://pdf.translatewebpages.org/");
      }
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    twpConfig.onReady(() => {
      updateContextMenu();
      updateTranslateSelectedContextMenu();
    });
    chrome.tabs.sendMessage(
      activeInfo.tabId,
      {
        action: "getCurrentPageLanguageState",
      },
      {
        frameId: 0,
      },
      (pageLanguageState) => {
        checkedLastError();
        if (pageLanguageState) {
          twpConfig.onReady(() => updateContextMenu(pageLanguageState));
        }
      }
    );
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.status == "loading") {
      twpConfig.onReady(() => updateContextMenu());
    } else if (changeInfo.status == "complete") {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "contentScriptIsInjected",
        },
        {
          frameId: 0,
        },
        (response) => {
          checkedLastError();
          tabHasContentScript[tabId] = !!response;
        }
      );
    }
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    delete tabHasContentScript[tabId];
  });

  chrome.tabs.query({}, (tabs) =>
    tabs.forEach((tab) =>
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "contentScriptIsInjected",
        },
        {
          frameId: 0,
        },
        (response) => {
          checkedLastError();
          if (response) {
            tabHasContentScript[tab.id] = true;
          }
        }
      )
    )
  );
}

twpConfig.onReady(() => {
  if (platformInfo.isMobile.any) {
    chrome.tabs.query({}, (tabs) =>
      tabs.forEach((tab) => {
        if (chrome.pageAction) {
          chrome.pageAction.hide(tab.id);
        }
      })
    );

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status == "loading" && chrome.pageAction) {
        chrome.pageAction.hide(tabId);
      }
    });

    chrome.browserAction.onClicked.addListener((tab) => {
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "showPopupMobile",
        },
        {
          frameId: 0,
        },
        checkedLastError
      );
    });
  } else {
    if (chrome.pageAction) {
      chrome.pageAction.onClicked.addListener((tab) => {
        if (twpConfig.get("translateClickingOnce") === "yes") {
          sendToggleTranslationMessage(tab.id);
        }
      });
    }
    chrome.browserAction.onClicked.addListener((tab) => {
      if (twpConfig.get("translateClickingOnce") === "yes") {
        sendToggleTranslationMessage(tab.id);
      }
    });

    resetBrowserAction();

    twpConfig.onChanged((name, newvalue) => {
      switch (name) {
        case "useOldPopup":
          resetBrowserAction();
          break;
        case "translateClickingOnce":
          resetBrowserAction();
          chrome.tabs.query(
            {
              currentWindow: true,
              active: true,
            },
            (tabs) => {
              resetPageAction(tabs[0].id);
            }
          );
          break;
      }
    });

    {
      let pageLanguageState = "original";

      // https://github.com/FilipePS/Traduzir-paginas-web/issues/548
      const isFirefoxAlpenglow = function (theme) {
        let isFirefoxAlpenglowTheme = false;
        try {
          if (
            [
              '{"additional_backgrounds_alignment":["right top","left top","right top"],"additional_backgrounds_tiling":["no-repeat","no-repeat","repeat-x"],"color_scheme":null,"content_color_scheme":null,"zap_gradient":"linear-gradient(90deg, #9059FF 0%, #FF4AA2 52.08%, #FFBD4F 100%)"}',
              '{"additional_backgrounds_alignment":["right top","left top","right top"],"additional_backgrounds_tiling":["no-repeat","no-repeat","repeat-x"],"color_scheme":null,"content_color_scheme":null}',
            ].includes(JSON.stringify(theme.properties)) &&
            [
              '{"accentcolor":null,"bookmark_text":"hsla(261, 53%, 15%, 1)","button_background_active":"hsla(240, 26%, 11%, .16)","button_background_hover":"hsla(240, 26%, 11%, .08)","frame":"hsla(240, 20%, 98%, 1)","frame_inactive":null,"icons":"hsla(258, 66%, 48%, 1)","icons_attention":"hsla(180, 100%, 32%, 1)","ntp_background":"#F9F9FB","ntp_card_background":null,"ntp_text":"hsla(261, 53%, 15%, 1)","popup":"hsla(254, 46%, 21%, 1)","popup_border":"hsla(255, 100%, 94%, .32)","popup_highlight":"hsla(255, 100%, 94%, .12)","popup_highlight_text":"hsla(0, 0%, 100%, 1)","popup_text":"hsla(255, 100%, 94%, 1)","sidebar":"hsla(240, 15%, 95%, 1)","sidebar_border":"hsla(261, 53%, 15%, .24)","sidebar_highlight":"hsla(265, 100%, 72%, 1)","sidebar_highlight_text":"hsla(0, 0%, 100%, 1)","sidebar_text":"hsla(261, 53%, 15%, 1)","tab_background_separator":"hsla(261, 53%, 15%, 1)","tab_background_text":"hsla(261, 53%, 15%, 1)","tab_line":"hsla(265, 100%, 72%, 1)","tab_loading":"hsla(265, 100%, 72%, 1)","tab_selected":null,"tab_text":"hsla(261, 53%, 15%, 1)","textcolor":null,"toolbar":"hsla(0, 0%, 100%, .76)","toolbar_bottom_separator":"hsla(261, 53%, 15%, .32)","toolbar_field":"hsla(0, 0%, 100%, .8)","toolbar_field_border":"transparent","toolbar_field_border_focus":"hsla(265, 100%, 72%, 1)","toolbar_field_focus":"hsla(261, 53%, 15%, .96)","toolbar_field_highlight":"hsla(265, 100%, 72%, .32)","toolbar_field_highlight_text":null,"toolbar_field_separator":null,"toolbar_field_text":"hsla(261, 53%, 15%, 1)","toolbar_field_text_focus":"hsla(255, 100%, 94%, 1)","toolbar_text":"hsla(261, 53%, 15%, 1)","toolbar_top_separator":"transparent","toolbar_vertical_separator":"hsla(261, 53%, 15%, .2)","focus_outline":"hsla(258, 65%, 48%, 1)"}',
              '{"accentcolor":null,"bookmark_text":"hsla(261, 53%, 15%, 1)","button_background_active":"hsla(240, 26%, 11%, .16)","button_background_hover":"hsla(240, 26%, 11%, .08)","frame":"hsla(240, 20%, 98%, 1)","frame_inactive":null,"icons":"hsla(258, 66%, 48%, 1)","icons_attention":"hsla(180, 100%, 32%, 1)","ntp_background":"hsla(0, 0%, 100%, 1)","ntp_card_background":null,"ntp_text":"hsla(261, 53%, 15%, 1)","popup":"hsla(254, 46%, 21%, 1)","popup_border":"hsla(255, 100%, 94%, .32)","popup_highlight":"hsla(255, 100%, 94%, .12)","popup_highlight_text":null,"popup_text":"hsla(255, 100%, 94%, 1)","sidebar":"hsla(240, 15%, 95%, 1)","sidebar_border":"hsla(261, 53%, 15%, .24)","sidebar_highlight":"hsla(265, 100%, 72%, 1)","sidebar_highlight_text":"hsla(0, 0%, 100%, 1)","sidebar_text":"hsla(261, 53%, 15%, 1)","tab_background_separator":"hsla(261, 53%, 15%, 1)","tab_background_text":"hsla(261, 53%, 15%, 1)","tab_line":"hsla(265, 100%, 72%, 1)","tab_loading":"hsla(265, 100%, 72%, 1)","tab_selected":null,"tab_text":"hsla(261, 53%, 15%, 1)","textcolor":null,"toolbar":"hsla(0, 0%, 100%, .76)","toolbar_bottom_separator":"hsla(261, 53%, 15%, .32)","toolbar_field":"hsla(0, 0%, 100%, .8)","toolbar_field_border":"hsla(261, 53%, 15%, .32)","toolbar_field_border_focus":"hsla(265, 100%, 72%, 1)","toolbar_field_focus":"hsla(261, 53%, 15%, .96)","toolbar_field_highlight":"hsla(265, 100%, 72%, .32)","toolbar_field_highlight_text":null,"toolbar_field_separator":"hsla(261, 53%, 15%, .32)","toolbar_field_text":"hsla(261, 53%, 15%, 1)","toolbar_field_text_focus":"hsla(255, 100%, 94%, 1)","toolbar_text":"hsla(261, 53%, 15%, 1)","toolbar_top_separator":"hsla(261, 53%, 15%, 1)","toolbar_vertical_separator":"hsla(261, 53%, 15%, .08)"}',
            ].includes(JSON.stringify(theme.colors))
          ) {
            isFirefoxAlpenglowTheme = true;
          }
        } catch {}
        return isFirefoxAlpenglowTheme;
      };

      let themeColorFrame = null;
      let themeColorToolbar = null;
      let themeColorToolbarField = null;
      let themeColorFieldText = null;
      let themeColorAttention = null;
      let isUsingTheme = false;
      let isFirefoxAlpenglowTheme = false;
      if (typeof browser != "undefined" && browser.theme) {
        function onThemeUpdated() {
          browser.theme.getCurrent().then((theme) => {
            themeColorFrame = null;
            themeColorToolbar = null;
            themeColorToolbarField = null;
            themeColorFieldText = null;
            themeColorAttention = null;
            if (theme.colors && theme.colors.frame) {
              themeColorFrame = theme.colors.frame;
            }
            if (theme.colors && theme.colors.toolbar) {
              themeColorToolbar = theme.colors.toolbar;
            }
            if (theme.colors && theme.colors.toolbar_field) {
              themeColorToolbarField = theme.colors.toolbar_field;
            }
            if (theme.colors && theme.colors.toolbar_field_text) {
              themeColorFieldText = theme.colors.toolbar_field_text;
            }
            if (theme.colors && theme.colors.icons_attention) {
              themeColorAttention = theme.colors.icons_attention;
            }

            isUsingTheme = false;
            if (theme.colors || theme.images || theme.properties) {
              isUsingTheme = true;
            }

            isFirefoxAlpenglowTheme = isFirefoxAlpenglow(theme);

            updateIconInAllTabs();
          });
        }
        onThemeUpdated();
        browser.theme.onUpdated.addListener(() => onThemeUpdated());
      }

      let darkMode = false;
      darkMode = matchMedia("(prefers-color-scheme: dark)").matches;
      updateIconInAllTabs();

      matchMedia("(prefers-color-scheme: dark)").addEventListener(
        "change",
        () => {
          darkMode = matchMedia("(prefers-color-scheme: dark)").matches;
          updateIconInAllTabs();
        }
      );

      function getSVGIcon(incognito = false) {
        const svgXml = `<?xml version="1.0" encoding="iso-8859-1"?>
<!-- Uploaded to: SVG Repo, www.svgrepo.com, Generator: SVG Repo Mixer Tools -->
<svg height="600px" width="600px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
	 viewBox="0 0 511.999 511.999" xml:space="preserve">
<path style="fill:#B8C9D9;" d="M461.909,133.563H320.778c-4.986,0-9.706,2.226-12.878,6.077c-3.172,3.84-4.452,8.904-3.506,13.79
	l37.108,191.607H190.331c-5.009,0-9.739,2.237-12.922,6.111c-3.172,3.862-4.43,8.96-3.45,13.857l26.713,133.563
	c1.625,8.114,8.515,13.111,15.772,13.423h245.466c27.614,0,50.086-22.472,50.086-50.086V183.649
	C511.995,156.035,489.523,133.563,461.909,133.563z"/>
<path style="fill:#E6F3FF;" d="M461.909,283.821h-50.086v-16.695c0-9.22-7.475-16.695-16.695-16.695
	c-9.22,0-16.695,7.475-16.695,16.695v16.695h-50.086c-9.22,0-16.695,7.475-16.695,16.695s7.475,16.695,16.695,16.695h17.982
	c3.195,19.862,12.261,34.916,25.553,50.151c-7.137,6.956-14.031,13.602-21.95,21.521c-6.52,6.519-6.52,17.09,0,23.611
	c6.519,6.52,17.091,6.52,23.611,0c7.794-7.793,14.674-14.425,21.586-21.163c6.902,6.729,13.789,13.368,21.586,21.163
	c6.519,6.52,17.09,6.521,23.611,0c6.52-6.52,6.52-17.091,0-23.611c-7.914-7.914-14.802-14.555-21.95-21.521
	c13.293-15.234,22.357-30.288,25.553-50.151h17.982c9.22,0,16.695-7.475,16.695-16.695S471.129,283.821,461.909,283.821z
	 M395.128,343.229c-7.323-8.736-12.152-16.753-14.652-26.017h29.303C407.279,326.476,402.449,334.494,395.128,343.229z"/>
<path style="fill:#2860CC;" d="M377.286,355.656c-2.504-6.4-8.682-10.618-15.549-10.618H190.331c-5.009,0-9.739,2.237-12.922,6.111
	c-3.172,3.862-4.43,8.96-3.45,13.857l26.713,133.563c1.625,8.114,8.515,13.111,15.772,13.423c0.479,0.011,0.957,0.011,1.436,0
	c3.706-0.167,7.413-1.581,10.496-4.419l144.693-133.563C378.121,369.346,379.79,362.056,377.286,355.656z"/>
<path style="fill:#167EE6;" d="M361.737,378.428H50.09c-27.619,0-50.086-22.467-50.086-50.086V50.086C0.004,22.468,22.472,0,50.09,0
	h244.865c8,0,14.869,5.674,16.391,13.521l66.781,345.037c0.946,4.892-0.337,9.956-3.51,13.794
	C371.443,376.2,366.726,378.428,361.737,378.428z"/>
<path style="fill:#E6F3FF;" d="M166.958,255.996c-36.814,0-66.781-29.967-66.781-66.781s29.967-66.781,66.781-66.781
	c9.032,0,17.804,1.793,26.021,5.282c8.478,3.62,12.424,13.434,8.804,21.913c-3.62,8.446-13.402,12.424-21.913,8.804
	c-4.044-1.729-8.413-2.609-12.913-2.609c-18.424,0-33.391,14.967-33.391,33.391s14.967,33.391,33.391,33.391
	c12.326,0,23.119-6.717,28.923-16.695h-12.228c-9.228,0-16.695-7.467-16.695-16.695c0-9.228,7.467-16.695,16.695-16.695h33.391
	c9.228,0,16.695,7.467,16.695,16.695C233.739,226.028,203.772,255.996,166.958,255.996z"/>
</svg>
                `;

        let svg64;
        if (
          pageLanguageState === "translated" &&
          twpConfig.get("popupBlueWhenSiteIsTranslated") === "yes"
        ) {
          svg64 = svgXml.replace(/\$\(fill\-opacity\)\;/g, "1.0");
          if (isFirefoxAlpenglowTheme) {
            if (darkMode || incognito) {
              svg64 = btoa(
                svg64.replace(/\$\(fill\)\;/g, "hsla(157, 100%, 66%, 1)")
              );
            } else {
              svg64 = btoa(
                svg64.replace(/\$\(fill\)\;/g, "hsla(180, 100%, 32%, 1)")
              );
            }
          } else {
            if (
              themeColorFrame &&
              themeColorToolbar &&
              themeColorToolbarField
            ) {
              try {
                darkMode = isDarkColor(
                  standardize_color(
                    themeColorFrame,
                    themeColorToolbar,
                    themeColorToolbarField
                  )
                );
              } catch (e) {
                console.error(e);
              }
            } else if (themeColorFieldText) {
              try {
                darkMode = !isDarkColor(
                  standardize_color(
                    themeColorFieldText,
                    themeColorFieldText,
                    themeColorFieldText
                  )
                );
              } catch (e) {
                console.error(e);
              }
            }

            if (themeColorAttention) {
              svg64 = btoa(svg64.replace(/\$\(fill\)\;/g, themeColorAttention));
            } else if (!isUsingTheme && (darkMode || incognito)) {
              svg64 = btoa(svg64.replace(/\$\(fill\)\;/g, "rgb(0, 221, 255)"));
            } else if (isUsingTheme && darkMode) {
              svg64 = btoa(svg64.replace(/\$\(fill\)\;/g, "rgb(0, 221, 255)"));
            } else {
              svg64 = btoa(svg64.replace(/\$\(fill\)\;/g, "rgb(0, 97, 224)"));
            }
          }
        } else {
          if (isUsingTheme) {
            svg64 = svgXml.replace(/\$\(fill\-opacity\)\;/g, "0.9");
          } else if (darkMode || incognito) {
            svg64 = svgXml.replace(/\$\(fill\-opacity\)\;/g, "1");
          } else {
            svg64 = svgXml.replace(/\$\(fill\-opacity\)\;/g, "0.72");
          }
          if (isFirefoxAlpenglowTheme) {
            if (darkMode || incognito) {
              svg64 = btoa(
                svg64.replace(/\$\(fill\)\;/g, "hsla(255, 100%, 94%, 1)")
              );
            } else {
              svg64 = btoa(
                svg64.replace(/\$\(fill\)\;/g, "hsla(261, 53%, 15%, 1)")
              );
            }
          } else {
            if (themeColorFieldText) {
              svg64 = btoa(svg64.replace(/\$\(fill\)\;/g, themeColorFieldText));
            } else if (!isUsingTheme && (darkMode || incognito)) {
              svg64 = btoa(
                svg64.replace(/\$\(fill\)\;/g, "rgb(251, 251, 254)")
              );
            } else {
              svg64 = btoa(svg64.replace(/\$\(fill\)\;/g, "rgb(21, 20, 26)"));
            }
          }
        }

        const b64Start = "data:image/svg+xml;base64,";
        return b64Start + svg64;
      }

      function standardize_color(str1, str2, str3) {
        var ctx = new OffscreenCanvas(1, 1).getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = str1;
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = str2;
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = str3;
        ctx.fillRect(0, 0, 1, 1);
        var data = ctx.getImageData(0, 0, 1, 1).data;
        var rgb = [data[0], data[1], data[2]];
        ctx.fillStyle = "rgb(" + rgb.join(",") + ")";
        return ctx.fillStyle;
      }

      function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : null;
      }

      function isDarkColor(hexColor) {
        var rgb = hexToRgb(hexColor);

        // Normalizando os valores RGB para o intervalo [0, 1]
        var r = rgb.r / 255,
          g = rgb.g / 255,
          b = rgb.b / 255,
          max = Math.max(r, g, b),
          min = Math.min(r, g, b),
          l = (max + min) / 2;

        // Verificando a luminosidade
        return l <= 0.5;
      }

      function updateIcon(tabId) {
        chrome.tabs.get(tabId, (tabInfo) => {
          const incognito = tabInfo ? tabInfo.incognito : false;

          if (chrome.pageAction) {
            resetPageAction(tabId);
            chrome.pageAction.setIcon({
              tabId: tabId,
              path: getSVGIcon(incognito),
            });

            if (twpConfig.get("showButtonInTheAddressBar") == "no") {
              chrome.pageAction.hide(tabId);
            } else {
              chrome.pageAction.show(tabId);
            }
          }

          if (chrome.browserAction) {
            if (
              pageLanguageState === "translated" &&
              twpConfig.get("popupBlueWhenSiteIsTranslated") === "yes"
            ) {
              chrome.browserAction.setIcon({
                tabId: tabId,
                path: "/icons/icon-32-translated.png",
              });
            } else {
              chrome.browserAction.setIcon({
                tabId: tabId,
                path: "/icons/icon-32.png",
              });
            }
          }
        });
      }

      function updateIconInAllTabs() {
        chrome.tabs.query({}, (tabs) =>
          tabs.forEach((tab) => updateIcon(tab.id))
        );
      }

      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status == "loading") {
          pageLanguageState = "original";
          updateIcon(tabId);
        } else if (changeInfo.status == "complete") {
          chrome.tabs.sendMessage(
            tabId,
            {
              action: "getCurrentPageLanguageState",
            },
            {
              frameId: 0,
            },
            (_pageLanguageState) => {
              checkedLastError();
              if (_pageLanguageState) {
                pageLanguageState = _pageLanguageState;
                updateIcon(tabId);
              }
            }
          );
        }
      });

      chrome.tabs.onActivated.addListener((activeInfo) => {
        pageLanguageState = "original";
        updateIcon(activeInfo.tabId);
        chrome.tabs.sendMessage(
          activeInfo.tabId,
          {
            action: "getCurrentPageLanguageState",
          },
          {
            frameId: 0,
          },
          (_pageLanguageState) => {
            checkedLastError();
            if (_pageLanguageState) {
              pageLanguageState = _pageLanguageState;
              updateIcon(activeInfo.tabId);
            }
          }
        );
      });

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "setPageLanguageState") {
          pageLanguageState = request.pageLanguageState;
          updateIcon(sender.tab.id);
        }
      });

      twpConfig.onChanged((name, newvalue) => {
        switch (name) {
          case "useOldPopup":
            updateIconInAllTabs();
            break;
          case "showButtonInTheAddressBar":
            updateIconInAllTabs();
            break;
        }
      });
    }
  }
});

if (typeof chrome.commands !== "undefined") {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "hotkey-toggle-translation") {
      chrome.tabs.query(
        {
          currentWindow: true,
          active: true,
        },
        (tabs) => sendToggleTranslationMessage(tabs[0].id)
      );
    } else if (command === "hotkey-translate-selected-text") {
      chrome.tabs.query(
        {
          currentWindow: true,
          active: true,
        },
        (tabs) =>
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "TranslateSelectedText",
            },
            checkedLastError
          )
      );
    } else if (command === "hotkey-swap-page-translation-service") {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) =>
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "swapTranslationService",
              newServiceName: twpConfig.swapPageTranslationService(),
            },
            checkedLastError
          )
      );
    } else if (command === "hotkey-show-original") {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) =>
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "translatePage",
              targetLanguage: "original",
            },
            checkedLastError
          )
      );
    } else if (command === "hotkey-translate-page-1") {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) => {
          twpConfig.setTargetLanguage(twpConfig.get("targetLanguages")[0]);
          sendTranslatePageMessage(
            tabs[0].id,
            twpConfig.get("targetLanguages")[0]
          );
        }
      );
    } else if (command === "hotkey-translate-page-2") {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) => {
          twpConfig.setTargetLanguage(twpConfig.get("targetLanguages")[1]);
          sendTranslatePageMessage(
            tabs[0].id,
            twpConfig.get("targetLanguages")[1]
          );
        }
      );
    } else if (command === "hotkey-translate-page-3") {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) => {
          twpConfig.setTargetLanguage(twpConfig.get("targetLanguages")[2]);
          sendTranslatePageMessage(
            tabs[0].id,
            twpConfig.get("targetLanguages")[2]
          );
        }
      );
    } else if (command === "hotkey-hot-translate-selected-text") {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs) => {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "hotTranslateSelectedText",
            },
            checkedLastError
          );
        }
      );
    }
  });
}

twpConfig.onReady(async () => {
  updateContextMenu();
  updateTranslateSelectedContextMenu();

  twpConfig.onChanged((name, newvalue) => {
    if (name === "showTranslateSelectedContextMenu") {
      updateTranslateSelectedContextMenu();
    }
  });

  if (!twpConfig.get("installDateTime")) {
    twpConfig.set("installDateTime", Date.now());
  }
});

twpConfig.onReady(async () => {
  let navigationsInfo = {};
  let tabsInfo = {};

  function tabsOnRemoved(tabId) {
    delete navigationsInfo[tabId];
    delete tabsInfo[tabId];
  }

  function runtimeOnMessage(request, sender, sendResponse) {
    if (request.action === "setPageLanguageState") {
      tabsInfo[sender.tab.id] = {
        pageLanguageState: request.pageLanguageState,
        host: new URL(sender.tab.url).host,
      };
    }
  }

  //TODO ver porque no Firefox o evento OnCommitted executa antes de OnCreatedNavigationTarget e OnBeforeNavigate quando [target="_blank"]

  function webNavigationOnCreatedNavigationTarget(details) {
    const navInfo = navigationsInfo[details.tabId] || {};
    navInfo.sourceTabId = details.sourceTabId;
    navigationsInfo[details.tabId] = navInfo;
  }

  function webNavigationOnBeforeNavigate(details) {
    if (details.frameId !== 0) return;

    const navInfo = navigationsInfo[details.tabId] || {
      sourceTabId: details.tabId,
    };
    navInfo.beforeNavigateIsExecuted = true;
    if (tabsInfo[navInfo.sourceTabId]) {
      navInfo.sourceHost = tabsInfo[navInfo.sourceTabId].host;
      navInfo.sourcePageLanguageState =
        tabsInfo[navInfo.sourceTabId].pageLanguageState;
    }
    navigationsInfo[details.tabId] = navInfo;

    if (navInfo.promise_resolve) {
      navInfo.promise_resolve();
    }
  }

  async function webNavigationOnCommitted(details) {
    if (details.frameId !== 0) return;

    const navInfo = navigationsInfo[details.tabId] || {
      sourceTabId: details.tabId,
    };
    navInfo.transitionType = details.transitionType;
    navigationsInfo[details.tabId] = navInfo;

    if (!navInfo.beforeNavigateIsExecuted) {
      await new Promise((resolve) => (navInfo.promise_resolve = resolve));
    }
  }

  function webNavigationOnDOMContentLoaded(details) {
    if (details.frameId !== 0) return;

    const navInfo = navigationsInfo[details.tabId];

    if (navInfo && navInfo.sourceHost) {
      const host = new URL(details.url).host;
      if (
        navInfo.transitionType === "link" &&
        navInfo.sourcePageLanguageState === "translated" &&
        navInfo.sourceHost === host
      ) {
        setTimeout(
          () =>
            chrome.tabs.sendMessage(
              details.tabId,
              {
                action: "autoTranslateBecauseClickedALink",
              },
              {
                frameId: 0,
              },
              checkedLastError
            ),
          500
        );
      }
    }

    delete navigationsInfo[details.tabId];
  }

  function enableTranslationOnClickingALink() {
    disableTranslationOnClickingALink();
    if (!chrome.webNavigation) return;

    chrome.tabs.onRemoved.addListener(tabsOnRemoved);
    chrome.runtime.onMessage.addListener(runtimeOnMessage);

    chrome.webNavigation.onCreatedNavigationTarget.addListener(
      webNavigationOnCreatedNavigationTarget
    );
    chrome.webNavigation.onBeforeNavigate.addListener(
      webNavigationOnBeforeNavigate
    );
    chrome.webNavigation.onCommitted.addListener(webNavigationOnCommitted);
    chrome.webNavigation.onDOMContentLoaded.addListener(
      webNavigationOnDOMContentLoaded
    );
  }

  function disableTranslationOnClickingALink() {
    navigationsInfo = {};
    tabsInfo = {};
    chrome.tabs.onRemoved.removeListener(tabsOnRemoved);
    chrome.runtime.onMessage.removeListener(runtimeOnMessage);

    if (chrome.webNavigation) {
      chrome.webNavigation.onCreatedNavigationTarget.removeListener(
        webNavigationOnCreatedNavigationTarget
      );
      chrome.webNavigation.onBeforeNavigate.removeListener(
        webNavigationOnBeforeNavigate
      );
      chrome.webNavigation.onCommitted.removeListener(webNavigationOnCommitted);
      chrome.webNavigation.onDOMContentLoaded.removeListener(
        webNavigationOnDOMContentLoaded
      );
    } else {
      console.info("No webNavigation permission");
    }
  }

  twpConfig.onChanged((name, newvalue) => {
    if (name === "autoTranslateWhenClickingALink") {
      if (newvalue == "yes") {
        enableTranslationOnClickingALink();
      } else {
        disableTranslationOnClickingALink();
      }
    }
  });

  if (chrome.permissions.onRemoved) {
    chrome.permissions.onRemoved.addListener((permissions) => {
      if (permissions.permissions.indexOf("webNavigation") !== -1) {
        twpConfig.set("autoTranslateWhenClickingALink", "no");
      }
    });
  }

  chrome.permissions.contains(
    {
      permissions: ["webNavigation"],
    },
    (hasPermissions) => {
      if (
        hasPermissions &&
        twpConfig.get("autoTranslateWhenClickingALink") === "yes"
      ) {
        enableTranslationOnClickingALink();
      } else {
        twpConfig.set("autoTranslateWhenClickingALink", "no");
      }
    }
  );
});

// garante que a extensão só seja atualizada quando reiniciar o navegador.
// caso seja uma atualização manual, realiza uma limpeza e recarrega a extensão para instalar a atualização.
chrome.runtime.onUpdateAvailable.addListener((details) => {
  var reloaded = false;

  setTimeout(function () {
    if (!reloaded) {
      reloaded = true;
      chrome.runtime.reload();
    }
  }, 2200);

  chrome.tabs.query({}, (tabs) => {
    const cleanUpsPromises = [];
    tabs.forEach((tab) => {
      cleanUpsPromises.push(
        new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { action: "cleanUp" }, resolve);
        })
      );
    });
    Promise.all(cleanUpsPromises).finally(() => {
      if (!reloaded) {
        reloaded = true;
        chrome.runtime.reload();
      }
    });
  });

  // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  //   const url = new URL(tabs[0].url);
  //   if (
  //     (url.hostname === "github.com" &&
  //       url.pathname.includes("FilipePS/Traduzir-paginas-web/releases")) ||
  //     (url.hostname === "addons.mozilla.org" &&
  //       url.pathname.includes("addon/traduzir-paginas-web/versions"))
  //   ) {
  //     chrome.tabs.query({}, (tabs) => {
  //       const cleanUpsPromises = [];
  //       tabs.forEach((tab) => {
  //         cleanUpsPromises.push(
  //           new Promise((resolve) => {
  //             chrome.tabs.sendMessage(tab.id, { action: "cleanUp" }, resolve);
  //           })
  //         );
  //       });
  //       Promise.all(cleanUpsPromises).finally(() => {
  //         chrome.runtime.reload();
  //       });
  //     });
  //   }
  // });
});
