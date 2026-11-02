using KeyoGame.Net;
using KeyoGame.Protocol;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    public class ProtocolTests
    {
        [Test]
        public void ParsesResponsesEventsAndRejectsGarbage()
        {
            var ok = ServerMessage.TryParse("{\"type\":\"res\",\"id\":\"abcdefgh\",\"ok\":true,\"data\":{\"now\":5}}");
            Assert.AreEqual(ServerMessage.MessageKind.Response, ok.Kind);
            Assert.IsTrue(ok.Ok);
            Assert.AreEqual(5, (int)ok.Data["now"]);

            var err = ServerMessage.TryParse("{\"type\":\"res\",\"id\":\"abcdefgh\",\"ok\":false,\"error\":{\"code\":\"insufficient_funds\"}}");
            Assert.IsFalse(err.Ok);
            Assert.AreEqual("insufficient_funds", err.ErrorCode);

            var ev = ServerMessage.TryParse("{\"type\":\"event\",\"event\":\"wallet\",\"data\":{\"balance\":100}}");
            Assert.AreEqual("wallet", ev.EventName);

            Assert.IsNull(ServerMessage.TryParse("not json"));
            Assert.IsNull(ServerMessage.TryParse("{\"type\":\"res\"}"));
            Assert.IsNull(ServerMessage.TryParse("{\"type\":\"other\"}"));
            Assert.IsNull(ServerMessage.TryParse(""));
        }

        [Test]
        public void SerializesClientFramesWithTypeAndIdAndValidatesId()
        {
            var s = ClientMessage.Serialize("table.join", "12345678", new JObject { ["tableId"] = "tx-1" });
            var o = JObject.Parse(s);
            Assert.AreEqual("table.join", (string)o["type"]);
            Assert.AreEqual("12345678", (string)o["id"]);
            Assert.AreEqual("tx-1", (string)o["tableId"]);
            Assert.Throws<System.ArgumentException>(() => ClientMessage.Serialize("ping", "short", null));
            Assert.That(RequestIds.Next().Length, Is.InRange(8, 64));
            Assert.AreNotEqual(RequestIds.Next(), RequestIds.Next());
        }

        [Test]
        public void PendingRequestsTimeOutFailAllAndIgnoreLateAnswers()
        {
            var p = new PendingRequests();
            RequestResult a = null, b = null;
            p.Add("aaaaaaaa", "table.bet", 0, 1000, r => a = r);
            p.Add("bbbbbbbb", "ping", 0, 5000, r => b = r);
            Assert.AreEqual(1, p.Tick(1000));
            Assert.AreEqual(RequestResult.Timeout, a.ErrorCode);
            Assert.IsTrue(a.OutcomeUnknown, "a timed-out bet has an unknown outcome");
            // A late answer for the timed-out request is ignored (callback never runs twice).
            Assert.IsFalse(p.Resolve(ServerMessage.Response("aaaaaaaa", null)));
            p.FailAll(RequestResult.ConnectionLost);
            Assert.AreEqual(RequestResult.ConnectionLost, b.ErrorCode);
            Assert.AreEqual(0, p.Count);
            Assert.IsFalse(RequestResult.Fail(RequestResult.NotConnected).OutcomeUnknown, "not sent → nothing happened");
        }

        [Test]
        public void ReconnectBackoffGrowsCapsAndStopsOnTerminalCodes()
        {
            var policy = new ReconnectPolicy(() => 0.5) { BaseDelayMs = 500, MaxDelayMs = 4000 };
            Assert.AreEqual(500, policy.NextDelayMs());
            Assert.AreEqual(1000, policy.NextDelayMs());
            Assert.AreEqual(2000, policy.NextDelayMs());
            Assert.AreEqual(4000, policy.NextDelayMs());
            Assert.AreEqual(4000, policy.NextDelayMs());
            policy.Reset();
            Assert.AreEqual(500, policy.NextDelayMs());
            Assert.IsTrue(ReconnectPolicy.IsTerminal(4001));
            Assert.IsTrue(ReconnectPolicy.IsTerminal(4000));
            Assert.IsFalse(ReconnectPolicy.IsTerminal(1006));
            var jitter = new ReconnectPolicy(() => 0.0) { BaseDelayMs = 1000 };
            Assert.AreEqual(750, jitter.NextDelayMs(), "−25 % jitter");
        }
    }
}
