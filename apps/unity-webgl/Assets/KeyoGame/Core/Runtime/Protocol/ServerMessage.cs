using System;
using Newtonsoft.Json.Linq;

namespace KeyoGame.Protocol
{
    /// <summary>
    /// One message from the Keyo WebSocket gateway (apps/server/src/realtime/gateway.ts).
    /// Shapes (packages/shared/src/contracts/api.ts, ServerMessage):
    ///   {type:'res', id, ok:true, data} | {type:'res', id, ok:false, error:{code}} | {type:'event', event, data}
    /// Engine-agnostic: compiled by Unity and by the plain .NET test project.
    /// </summary>
    public sealed class ServerMessage
    {
        public enum MessageKind { Response, Event }

        public MessageKind Kind { get; private set; }
        public string Id { get; private set; }
        public bool Ok { get; private set; }
        public string ErrorCode { get; private set; }
        public string EventName { get; private set; }
        public JToken Data { get; private set; }

        public static ServerMessage Response(string id, JToken data) => new ServerMessage { Kind = MessageKind.Response, Id = id, Ok = true, Data = data };
        public static ServerMessage Failure(string id, string code) => new ServerMessage { Kind = MessageKind.Response, Id = id, Ok = false, ErrorCode = code };
        public static ServerMessage Event(string name, JToken data) => new ServerMessage { Kind = MessageKind.Event, EventName = name, Data = data };

        /// <summary>Parses one frame. Returns null for anything that is not a valid gateway message (never throws).</summary>
        public static ServerMessage TryParse(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return null;
            JObject o;
            try { o = JObject.Parse(raw); }
            catch (Exception) { return null; }
            var type = (string)o["type"];
            if (type == "res")
            {
                var id = (string)o["id"];
                if (string.IsNullOrEmpty(id)) return null;
                if (o["ok"]?.Type == JTokenType.Boolean && (bool)o["ok"]) return Response(id, o["data"]);
                var code = (string)o["error"]?["code"] ?? "internal";
                return Failure(id, code);
            }
            if (type == "event")
            {
                var name = (string)o["event"];
                if (string.IsNullOrEmpty(name)) return null;
                return Event(name, o["data"]);
            }
            return null;
        }
    }

    /// <summary>Builds client frames: {type, id, ...payload}. The gateway validates every field server-side.</summary>
    public static class ClientMessage
    {
        public static string Serialize(string type, string id, JObject payload)
        {
            if (string.IsNullOrEmpty(type)) throw new ArgumentException("type");
            if (id == null || id.Length < 8 || id.Length > 64) throw new ArgumentException("request id must be 8–64 chars");
            var o = payload != null ? (JObject)payload.DeepClone() : new JObject();
            o["type"] = type;
            o["id"] = id;
            return o.ToString(Newtonsoft.Json.Formatting.None);
        }
    }
}
