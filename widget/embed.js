<!--
  Price Recommendation System — JS embed snippet.
  Use this if you want a single <div> tag that the script fills.
  Place the <div id="prs-widget"></div> where the widget should appear,
  then include the <script> below (can be in <head> or end of <body>).

  Updates flow automatically from GitHub → Streamlit Cloud → this iframe.
-->

<div id="prs-widget"></div>

<script>
(function () {
  // ---- Configuration -------------------------------------------------------
  var STREAMLIT_URL = 'https://prs-publishers.streamlit.app';
  var EMBED_PARAMS  = '?embed=true&embed_options=light_theme';
  var MIN_HEIGHT_PX = 1400;        // initial height; auto-resizes if the app sends messages
  var BORDER_RADIUS = '12px';

  // ---- Mount ---------------------------------------------------------------
  var container = document.getElementById('prs-widget');
  if (!container) {
    console.warn('[PRS widget] container #prs-widget not found');
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.src             = STREAMLIT_URL + EMBED_PARAMS;
  iframe.title           = 'Price Recommendation System';
  iframe.loading         = 'lazy';
  iframe.allow           = 'clipboard-write';
  iframe.style.width     = '100%';
  iframe.style.height    = MIN_HEIGHT_PX + 'px';
  iframe.style.border    = 'none';
  iframe.style.borderRadius = BORDER_RADIUS;
  iframe.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
  container.appendChild(iframe);

  // ---- Optional auto-resize via postMessage --------------------------------
  // Streamlit's embed mode emits messages for internal components; we listen
  // for any height-setting messages and grow the iframe to match.
  window.addEventListener('message', function (ev) {
    if (!ev || !ev.data) return;
    var d = ev.data;
    if (d.type === 'streamlit:setFrameHeight' && typeof d.height === 'number') {
      iframe.style.height = Math.max(d.height, MIN_HEIGHT_PX) + 'px';
    }
  });
})();
</script>
