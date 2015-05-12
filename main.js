chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(
      "control-panel.html",
      {
          innerBounds: { width: 650, height: 510, minWidth: 650, minHeight: 510 },
          resizable: false
      });
});

