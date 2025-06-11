/***************************************************
 * background.js
 ***************************************************/

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Anchorly installed: free version enabled.");
  }

  chrome.contextMenus.create({
    id: "saveAnchorContextMenu",
    title: "Save Anchor (Anchorly)",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveAnchorContextMenu" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "saveAnchor",
      selectionText: info.selectionText
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "save_anchor_shortcut") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab) return;
      chrome.tabs.sendMessage(currentTab.id, {
        action: "saveAnchorViaShortcut"
      });
    });
  }
});

function normalizeUrl(url) {
  return url.endsWith("/") ? url : url + "/";
}

function updateBadgeForTab(tab) {
  if (!tab || !tab.url) return;
  chrome.storage.local.get({ anchors: [] }, (res) => {
    const anchors = res.anchors.filter(a => normalizeUrl(a.url) === normalizeUrl(tab.url));
    chrome.action.setBadgeText({
      text: anchors.length ? String(anchors.length) : "",
      tabId: tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: "#FF0000",
      tabId: tab.id
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.anchors) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) updateBadgeForTab(tabs[0]);
    });
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    updateBadgeForTab(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateBadgeForTab(tab);
  }
});
