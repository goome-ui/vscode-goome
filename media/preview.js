(function () {
  const vscode = acquireVsCodeApi();
  const A = window.GMApp;
  const S = A.S;
  const noop = () => {};
  const stubs = { renderSide: noop, renderTop: noop, renderPalette: noop, renderDock: noop, scheduleCode: noop, refreshCode: noop, updateUndoPublic: noop, startDrag: noop, removeSel: noop, duplicate: noop, shift: noop, mpanel: noop, openTab: noop, elHooks: () => ({}) };
  for (const k in stubs) if (!A[k]) A[k] = stubs[k];
  A.renderAll = () => A.renderStage();

  const err = document.getElementById("gpErr");
  const nameEl = document.getElementById("gpName");
  let good = false;

  function showError(msg) {
    err.textContent = msg;
    err.hidden = !msg;
  }

  function load(text, file) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      showError((good ? "showing the last version that worked, " : "") + "this json doesnt parse: " + e.message);
      vscode.postMessage({ type: "rendered", nodes: 0, error: e.message });
      return;
    }
    try {
      S.project = GM.normProject(obj);
      S.sel = [];
      S.pv = {};
      S.editing = null;
      if (A.resetVals) A.resetVals();
      A.renderStage();
      nameEl.textContent = S.project.name || file || "goome ui";
      good = true;
      showError("");
      vscode.postMessage({ type: "rendered", nodes: document.querySelectorAll("#stageWrap [data-nid]").length, error: "" });
    } catch (e) {
      showError("the preview tripped over this project: " + e.message);
      vscode.postMessage({ type: "rendered", nodes: 0, error: e.message });
    }
  }

  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => vscode.postMessage({ type: "copy", lang: b.dataset.copy })));
  document.getElementById("gpBuilder").addEventListener("click", () => vscode.postMessage({ type: "builder" }));
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m && m.type === "load") load(String(m.text), m.name);
  });
  vscode.postMessage({ type: "ready" });
})();
