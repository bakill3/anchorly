/***************************************************
 * popup.js
 ***************************************************/

document.addEventListener("DOMContentLoaded", () => {
  const anchorsContainer = document.getElementById("anchorsContainer");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const exportBtn = document.getElementById("exportBtn");
  const addFolderBtn = document.getElementById("addFolderBtn");

  function normalizeUrl(url) {
    return url.endsWith("/") ? url : url + "/";
  }

  function getAllFolders(anchors, storedFolders) {
    const used = new Set();
    anchors.forEach(a => used.add(a.folder || "Ungrouped"));
    (storedFolders || []).forEach(f => used.add(f));
    return Array.from(used).sort();
  }

  function groupAnchorsByFolder(anchors) {
    const groups = {};
    anchors.forEach(a => {
      let f = a.folder || "Ungrouped";
      if (!groups[f]) groups[f] = [];
      groups[f].push(a);
    });
    return groups;
  }

  function handleDropOnFolder(folderName, anchorId, tabId) {
    chrome.storage.local.get({ anchors: [] }, (res) => {
      let all = res.anchors;
      let found = all.find(a => a.anchorId === anchorId);
      if (found) {
        found.folder = folderName;
      }
      chrome.storage.local.set({ anchors: all }, () => {
        refreshAnchors();
      });
    });
  }

  function createAnchorRow(anchor, tabId) {
    const itemDiv = document.createElement("div");
    itemDiv.className = "anchor-item";
    itemDiv.setAttribute("draggable", "true");
    itemDiv.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", anchor.anchorId);
    };

    // Jump button
    const jumpBtn = document.createElement("button");
    jumpBtn.className = "btn btn-primary btn-sm anchor-text-btn";
    let text = anchor.anchorText;
    if (text.length > 30) text = text.slice(0, 30) + "...";
    jumpBtn.textContent = text || "(no text)";
    if (anchor.note) jumpBtn.title = anchor.note;
    jumpBtn.addEventListener("click", () => {
      chrome.tabs.sendMessage(tabId, {
        action: "goToAnchor",
        anchorId: anchor.anchorId
      });
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-sm me-2";
    deleteBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
        fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
        <path d="M5.5 5.5A.5.5 
          0 0 1 6 5h4a.5.5 0 0 1 .5.5V6h1v-.5A1.5 
          1.5 0 0 0 10 4h-4A1.5 
          1.5 0 0 0 4.5 5.5V6h1v-.5zm1 
          3V6h1v2.5h-1zm2 
          0V6h1v2.5h-1zM2.5 
          6h11l-1 9.5a1 1 0 0 1-1 
          1h-7a1 1 0 0 1-1-1L2.5 
          6z"/>
      </svg>
    `;
    deleteBtn.addEventListener("click", () => {
      chrome.tabs.sendMessage(tabId, {
        action: "deleteAnchor",
        anchorId: anchor.anchorId
      });
      itemDiv.remove();
    });

    // Drag handle
    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle text-muted";
    dragHandle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
        fill="currentColor" class="bi bi-grip-vertical" viewBox="0 0 16 16">
        <path d="M2 12h2V10H2v2zm0-4h2V6H2v2zm0-4
         h2V2H2v2zm4 8h2V10H6v2zm0-4h2V6H6v2zm0-4h2V2H6v2zm4 
         8h2V10h-2v2zm0-4h2V6h-2v2zm0-4h2V2h-2v2z"/>
      </svg>
    `;

    itemDiv.appendChild(jumpBtn);
    itemDiv.appendChild(deleteBtn);
    itemDiv.appendChild(dragHandle);

    return itemDiv;
  }

  function deleteFolder(folderName) {
    chrome.storage.local.get({ folders: [], anchors: [] }, (res) => {
      let { folders, anchors } = res;
      folders = folders.filter(f => f !== folderName);
      anchors.forEach(a => {
        if ((a.folder || "Ungrouped") === folderName) {
          a.folder = "Ungrouped";
        }
      });
      chrome.storage.local.set({ folders, anchors }, () => {
        refreshAnchors();
      });
    });
  }

  function renderAnchorsForPage(pageAnchors, storedFolders, tabId, currentUrl) {
    anchorsContainer.innerHTML = "";

    if (!pageAnchors.length && !storedFolders.length) {
      anchorsContainer.innerHTML = `<div class="text-muted">No saved anchors or folders for this page.</div>`;
      return;
    }

    const allFolders = getAllFolders(pageAnchors, storedFolders);
    const folderGroups = groupAnchorsByFolder(pageAnchors);

    allFolders.forEach(folderName => {
      const folderCard = document.createElement("div");
      folderCard.className = "folder-card";
      folderCard.setAttribute("data-folder", folderName);

      // Accept anchors by drag
      folderCard.ondragover = (e) => {
        e.preventDefault();
        folderCard.classList.add("drag-over");
      };
      folderCard.ondragleave = () => {
        folderCard.classList.remove("drag-over");
      };
      folderCard.ondrop = (e) => {
        e.preventDefault();
        folderCard.classList.remove("drag-over");
        let anchorId = e.dataTransfer.getData("text/plain");
        handleDropOnFolder(folderName, anchorId, tabId);
      };

      // Folder header
      const folderHeader = document.createElement("div");
      folderHeader.className = "folder-header";

      const titleSpan = document.createElement("span");
      titleSpan.className = "folder-title";
      titleSpan.textContent = folderName;

      const deleteFolderBtn = document.createElement("button");
      deleteFolderBtn.className = "folder-delete-btn";
      deleteFolderBtn.title = "Delete Folder";
      deleteFolderBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
          fill="currentColor" class="bi bi-folder-x" viewBox="0 0 16 16">
          <path d="M9.828 4a.5.5 0 0 1 
            .354.146L11.707 5.67A.5.5 0 
            0 0 12 5.5V5a2 2 0 0 0-2-2H7.414a1 
            1 0 0 1-.707-.293L5.414 
            1.293A1 1 0 0 0 4.707 1H2a2 
            2 0 0 0-2 2v8a2 2 0 0 
            0 2 2h12a2 2 0 0 
            0 2-2V6a2 2 0 0 
            0-2-2H9.828z"/>
          <path d="M8.146 8.354a.5.5 
            0 1 1 .708-.708L10 8.793l1.146-1.147a.5.5 
            0 0 1 .708.708L10.707 9.5l1.147 
            1.146a.5.5 0 0 1-.708.708L10 
            10.207l-1.146 1.147a.5.5 
            0 0 1-.708-.708L9.293 9.5 
            8.146 8.354z"/>
        </svg>
      `;
      deleteFolderBtn.addEventListener("click", () => {
        if (confirm(`Delete folder "${folderName}"? Anchors inside become "Ungrouped".`)) {
          deleteFolder(folderName);
        }
      });

      folderHeader.appendChild(titleSpan);
      folderHeader.appendChild(deleteFolderBtn);
      folderCard.appendChild(folderHeader);

      const anchorsInFolder = folderGroups[folderName] || [];
      anchorsInFolder.forEach(a => {
        folderCard.appendChild(createAnchorRow(a, tabId));
      });

      anchorsContainer.appendChild(folderCard);
    });
  }

  function refreshAnchors() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let currentTab = tabs[0];
      if (!currentTab) return;
      const normalizedUrl = normalizeUrl(currentTab.url);
      chrome.storage.local.get({ anchors: [], folders: [] }, (res) => {
        let pageAnchors = res.anchors.filter(a => {
          let normA = a.url.endsWith("/") ? a.url : a.url + "/";
          return normA === normalizedUrl;
        });
        renderAnchorsForPage(pageAnchors, res.folders, currentTab.id, currentTab.url);
      });
    });
  }

  exportBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let currentTab = tabs[0];
      let norm = normalizeUrl(currentTab.url);
      chrome.storage.local.get({ anchors: [] }, (res) => {
        let anchors = res.anchors.filter(a => {
          let aa = a.url.endsWith("/") ? a.url : a.url + "/";
          return aa === norm;
        });
        if (!anchors.length) {
          alert("No anchors found for this page.");
          return;
        }
        const payload = {
          url: currentTab.url,
          anchors: anchors,
          exportedAt: new Date().toISOString()
        };
        fetch("https://tapgotech.com/text-anchor-saver/export.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
          .then(r => r.json())
          .then(data => {
            if (data.id) {
              const shareLink = `https://tapgotech.com/text-anchor-saver/share-iframe.php?id=${data.id}`;
              prompt("Shareable Link:", shareLink);
            } else {
              alert("Failed to export anchors.");
            }
          })
          .catch(err => {
            console.error("Error exporting anchors:", err);
            alert("Error exporting anchors.");
          });
      });
    });
  });

  clearAllBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let currentTab = tabs[0];
      let norm = normalizeUrl(currentTab.url);
      chrome.storage.local.get({ anchors: [] }, (res) => {
        let others = res.anchors.filter(a => {
          let aa = a.url.endsWith("/") ? a.url : a.url + "/";
          return aa !== norm;
        });
        chrome.storage.local.set({ anchors: others }, () => {
          res.anchors.forEach(a => {
            let anorm = a.url.endsWith("/") ? a.url : a.url + "/";
            if (anorm === norm) {
              chrome.tabs.sendMessage(currentTab.id, {
                action: "deleteAnchor",
                anchorId: a.anchorId
              });
            }
          });
          refreshAnchors();
        });
      });
    });
  });

  addFolderBtn.addEventListener("click", () => {
    const name = prompt("Folder name?");
    if (!name) return;
    chrome.storage.local.get({ folders: [] }, (res) => {
      let { folders } = res;
      if (!folders.includes(name)) {
        folders.push(name);
      }
      chrome.storage.local.set({ folders }, () => {
        refreshAnchors();
      });
    });
  });

  refreshAnchors();
});
