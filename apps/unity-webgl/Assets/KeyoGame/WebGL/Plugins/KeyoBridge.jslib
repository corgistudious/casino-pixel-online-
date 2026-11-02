// Keyo WebGL plugin: WebSocket + host bridge. Strings to C# are malloc'ed (Unity frees returned strings;
// callback buffers are freed here after the call). Callbacks use makeDynCall (Unity 2023+/6 toolchain).
// No secrets: the session token is read from the same-origin localStorage the React app already uses.
var KeyoBridgeLib = {
  $KeyoWs: { sockets: {}, next: 1, onOpen: 0, onMessage: 0, onClose: 0 },

  KeyoWs_SetCallbacks__deps: ['$KeyoWs'],
  KeyoWs_SetCallbacks: function (onOpen, onMessage, onClose) {
    KeyoWs.onOpen = onOpen;
    KeyoWs.onMessage = onMessage;
    KeyoWs.onClose = onClose;
  },

  KeyoWs_Open__deps: ['$KeyoWs'],
  KeyoWs_Open: function (urlPtr) {
    var url = UTF8ToString(urlPtr);
    var id = KeyoWs.next++;
    var closed = function (code) {
      delete KeyoWs.sockets[id];
      {{{ makeDynCall('vii', 'KeyoWs.onClose') }}}(id, code || 1006);
    };
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setTimeout(function () { closed(1006); }, 0);
      return id;
    }
    KeyoWs.sockets[id] = ws;
    ws.onopen = function () { {{{ makeDynCall('vi', 'KeyoWs.onOpen') }}}(id); };
    ws.onmessage = function (e) {
      if (typeof e.data !== 'string') return;
      var len = lengthBytesUTF8(e.data) + 1;
      var buf = _malloc(len);
      stringToUTF8(e.data, buf, len);
      try { {{{ makeDynCall('vii', 'KeyoWs.onMessage') }}}(id, buf); } finally { _free(buf); }
    };
    ws.onclose = function (e) { closed(e.code); };
    return id;
  },

  KeyoWs_Send__deps: ['$KeyoWs'],
  KeyoWs_Send: function (id, textPtr) {
    var ws = KeyoWs.sockets[id];
    if (ws && ws.readyState === 1) ws.send(UTF8ToString(textPtr));
  },

  KeyoWs_Close__deps: ['$KeyoWs'],
  KeyoWs_Close: function (id, code, reasonPtr) {
    var ws = KeyoWs.sockets[id];
    if (!ws) return;
    try { ws.close(code >= 3000 && code <= 4999 ? code : 1000, UTF8ToString(reasonPtr).slice(0, 120)); } catch (e) { ws.close(); }
  },

  KeyoBridge_GetToken: function () {
    var t = null;
    try { t = window.localStorage.getItem('cpo.token'); } catch (e) {}
    if (!t) return 0;
    var len = lengthBytesUTF8(t) + 1;
    var buf = _malloc(len);
    stringToUTF8(t, buf, len);
    return buf;
  },

  KeyoBridge_GetContext: function () {
    var s = '{}';
    try { s = JSON.stringify((window.KeyoHost && window.KeyoHost.context) || {}); } catch (e) {}
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },

  KeyoBridge_Post: function (jsonPtr) {
    try { window.KeyoHost && window.KeyoHost.post(UTF8ToString(jsonPtr)); } catch (e) {}
  },

  KeyoBridge_SetDprCap: function (cap) {
    try { window.KeyoHost && window.KeyoHost.setDprCap(cap); } catch (e) {}
  },
};
autoAddDeps(KeyoBridgeLib, '$KeyoWs');
mergeInto(LibraryManager.library, KeyoBridgeLib);
