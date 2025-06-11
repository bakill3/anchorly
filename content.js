console.log("CONTENT SCRIPT: Loaded content.js for page =>", window.location.href);

let bootstrapInjected = false;

function injectBootstrapIfNeeded() {
  if (bootstrapInjected) {
    console.log("CONTENT SCRIPT: Bootstrap already injected, skipping.");
    return;
  }
  bootstrapInjected = true;
  console.log("CONTENT SCRIPT: Injecting Bootstrap CSS now.");

  const linkId = "anchorlyBootstrapCss";
  if (!document.getElementById(linkId)) {
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("bootstrap-5.1.3-dist/css/bootstrap.min.css");
    document.head.appendChild(link);
  }
}

/**
 * Re-inject anchors if any exist for this page.
 */
function reInjectAnchorsForPage() {
  console.log("CONTENT SCRIPT: reInjectAnchorsForPage() called... Checking storage...");
  chrome.storage.local.get({ anchors: [] }, (res) => {
    const allAnchors = res.anchors;
    const currentUrl = window.location.href;
    const normCurrent = currentUrl.endsWith("/") ? currentUrl : currentUrl + "/";

    let pageAnchors = allAnchors.filter(a => {
      let aUrl = a.url.endsWith("/") ? a.url : a.url + "/";
      return aUrl === normCurrent;
    });

    console.log("CONTENT SCRIPT: Found", pageAnchors.length, "anchors for this page:", normCurrent);

    if (!pageAnchors.length) {
      console.log("CONTENT SCRIPT: No anchors => skipping re-injection.");
      return;
    }

    injectBootstrapIfNeeded();

    pageAnchors.forEach(anchor => {
      rewrapAnchorText(anchor);
    });
  });
}

/**
 * Find & wrap the anchor text in <span>.
 */
function rewrapAnchorText(anchorObj) {
  let textToFind = (anchorObj.anchorText || "").trim();
  if (!textToFind) {
    console.warn("CONTENT SCRIPT: Anchor", anchorObj.anchorId, "has empty text? Skipping.");
    return;
  }
  console.log("CONTENT SCRIPT: Attempting to re-wrap anchor text =>", textToFind);

  let walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  const lowerSearch = textToFind.toLowerCase();
  let node;

  while ((node = walker.nextNode())) {
    let nodeVal = node.nodeValue;
    if (!nodeVal) continue;
    let index = nodeVal.toLowerCase().indexOf(lowerSearch);
    if (index !== -1) {
      console.log("CONTENT SCRIPT: Found match in node =>", nodeVal);

      let before = nodeVal.substring(0, index);
      let match = nodeVal.substring(index, index + textToFind.length);
      let after = nodeVal.substring(index + textToFind.length);

      let span = document.createElement("span");
      span.id = anchorObj.anchorId;
      span.style.color = "gold";
      span.style.fontWeight = "bold";
      span.style.textDecoration = "underline";
      span.style.cursor = "pointer";
      if (anchorObj.note) {
        span.title = anchorObj.note;
      }
      span.textContent = match;

      let frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(span);
      if (after) frag.appendChild(document.createTextNode(after));
      node.parentNode.replaceChild(frag, node);

      console.log("CONTENT SCRIPT: Re-wrapped anchorId:", anchorObj.anchorId);
      attachHoverUI(span);
      return;
    }
  }
  console.warn("CONTENT SCRIPT: Could NOT find text =>", textToFind);
}

/**
 * Create anchor from selection.
 */
function createAnchorFromSelection(selectionText) {
  console.log("CONTENT SCRIPT: createAnchorFromSelection =>", selectionText);
  injectBootstrapIfNeeded();

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) {
    console.warn("CONTENT SCRIPT: No selection range found?");
    return;
  }

  let range = sel.getRangeAt(0);
  let span = document.createElement("span");
  let anchorId = "savedAnchor_" + Date.now();

  span.id = anchorId;
  span.style.color = "gold";
  span.style.fontWeight = "bold";
  span.style.textDecoration = "underline";
  span.style.cursor = "pointer";

  try {
    range.surroundContents(span);
  } catch (e) {
    console.warn("CONTENT SCRIPT: Error wrapping selection =>", e);
    let frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }

  let anchorData = {
    url: window.location.href,
    anchorId: anchorId,
    anchorText: selectionText.trim(),
    note: "",
    folder: "Ungrouped"
  };

  chrome.storage.local.get({ anchors: [] }, (res) => {
    let updated = res.anchors;
    updated.push(anchorData);
    chrome.storage.local.set({ anchors: updated }, () => {
      console.log("CONTENT SCRIPT: Created new anchor =>", anchorData);
    });
  });

  attachHoverUI(span);
}

/**
 * Hover UI for note editing and deletion
 */
function attachHoverUI(anchorElem) {
  let hoverDiv;
  anchorElem.addEventListener("mouseenter", () => {
    if (hoverDiv) return;

    chrome.storage.local.get({ anchors: [] }, (res) => {
      let found = res.anchors.find(a => a.anchorId === anchorElem.id);
      let noteText = found && found.note ? found.note : "No note";

      let rect = anchorElem.getBoundingClientRect();
      let scrollY = window.scrollY || document.documentElement.scrollTop;
      let scrollX = window.scrollX || document.documentElement.scrollLeft;

      hoverDiv = document.createElement("div");
      hoverDiv.style.position = "absolute";
      hoverDiv.style.top = (rect.top + scrollY - 65) + "px";
      hoverDiv.style.left = (rect.left + scrollX) + "px";
      hoverDiv.style.zIndex = 999999;
      hoverDiv.classList.add("p-2", "bg-white", "border", "rounded", "shadow-sm");

      hoverDiv.innerHTML = `
        <div style="font-size:0.85rem; margin-bottom:6px;">
          <strong>Note:</strong> ${noteText}
        </div>
        <div class="d-flex justify-content-end">
          <button class="btn btn-sm btn-secondary me-2" id="editBtn">Edit</button>
          <button class="btn btn-sm btn-danger" id="deleteBtn">Del</button>
        </div>
      `;
      document.body.appendChild(hoverDiv);

      const editBtn = hoverDiv.querySelector("#editBtn");
      const deleteBtn = hoverDiv.querySelector("#deleteBtn");

      editBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        openNoteEditorPopup(anchorElem.id);
      });

      deleteBtn.addEventListener("click", () => {
        console.log("CONTENT SCRIPT: Deleting anchor =>", anchorElem.id);
        chrome.runtime.sendMessage({
          action: "deleteAnchor",
          anchorId: anchorElem.id
        });
        hoverDiv.remove();
      });
    });
  });

  anchorElem.addEventListener("mouseleave", (e) => {
    setTimeout(() => {
      if (!hoverDiv) return;
      let related = e.relatedTarget;
      if (!related || (hoverDiv && !hoverDiv.contains(related))) {
        hoverDiv.remove();
        hoverDiv = null;
      }
    }, 200);
  });
}

/**
 * Editor popup for anchor note
 */
function openNoteEditorPopup(anchorId) {
  console.log("CONTENT SCRIPT: openNoteEditorPopup => anchorId:", anchorId);
  chrome.storage.local.get({ anchors: [] }, (res) => {
    let anchorObj = res.anchors.find(a => a.anchorId === anchorId);
    if (!anchorObj) {
      console.warn("CONTENT SCRIPT: anchor not found in storage =>", anchorId);
      return;
    }

    const popupDiv = document.createElement("div");
    popupDiv.style.position = "fixed";
    popupDiv.style.top = "50%";
    popupDiv.style.left = "50%";
    popupDiv.style.transform = "translate(-50%, -50%)";
    popupDiv.style.zIndex = 1000000;
    popupDiv.style.width = "400px";
    popupDiv.classList.add("p-3", "bg-white", "border", "rounded", "shadow-lg");

    popupDiv.innerHTML = `
      <h5 style="font-size:1rem;">Edit Note</h5>
      <textarea class="form-control my-2" id="noteEditor" rows="3" style="font-size:0.9rem;"></textarea>
      <div class="text-end">
        <button class="btn btn-light btn-sm me-2" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary btn-sm" id="saveBtn">Save</button>
      </div>
    `;
    document.body.appendChild(popupDiv);

    const noteEd = popupDiv.querySelector("#noteEditor");
    noteEd.value = anchorObj.note || "";

    popupDiv.querySelector("#cancelBtn").addEventListener("click", () => {
      popupDiv.remove();
    });
    popupDiv.querySelector("#saveBtn").addEventListener("click", () => {
      const newNote = noteEd.value.trim();
      anchorObj.note = newNote;
      chrome.storage.local.set({ anchors: res.anchors }, () => {
        let sp = document.getElementById(anchorId);
        if (sp) {
          if (newNote) sp.title = newNote;
          else sp.removeAttribute("title");
        }
      });
      popupDiv.remove();
    });
  });
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((msg, sender, resp) => {
  switch (msg.action) {
    case "saveAnchor":
      createAnchorFromSelection(msg.selectionText);
      break;

    case "saveAnchorViaShortcut": {
      let selText = window.getSelection().toString();
      if (selText) createAnchorFromSelection(selText);
      break;
    }

    case "goToAnchor": {
      let el = document.getElementById(msg.anchorId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "background-color 0.5s";
        let oldBg = el.style.backgroundColor;
        el.style.backgroundColor = "orange";
        setTimeout(() => {
          el.style.backgroundColor = oldBg;
        }, 1000);
      } else {
        console.warn("CONTENT SCRIPT: goToAnchor => element not found for ID", msg.anchorId);
      }
      break;
    }

    case "deleteAnchor": {
      let e = document.getElementById(msg.anchorId);
      if (e) {
        let p = e.parentNode;
        while (e.firstChild) {
          p.insertBefore(e.firstChild, e);
        }
        p.removeChild(e);
      }
      chrome.storage.local.get({ anchors: [] }, (r) => {
        let newArr = r.anchors.filter(a => a.anchorId !== msg.anchorId);
        chrome.storage.local.set({ anchors: newArr });
      });
      break;
    }
  }
});

function doMultiCheckReInject() {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    reInjectAnchorsForPage();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      reInjectAnchorsForPage();
    });
  }
  setTimeout(() => {
    reInjectAnchorsForPage();
  }, 5000);
}

doMultiCheckReInject();
