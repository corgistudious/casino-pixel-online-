using System.Collections.Generic;
using KeyoGame.Net;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    public class ConnectionTests
    {
        private FakeTransport _t;
        private KeyoConnection _c;
        private string _token;
        private int _resynced;
        private readonly List<string> _events = new List<string>();

        [SetUp]
        public void SetUp()
        {
            _t = new FakeTransport();
            _token = "jwt-token";
            _resynced = 0;
            _events.Clear();
            _c = new KeyoConnection(_t, () => _token, new ReconnectPolicy(() => 0.5) { BaseDelayMs = 500 });
            _c.Resynced += () => _resynced++;
            _c.EventReceived += (n, d) => _events.Add(n);
        }

        private void ConnectReady(long now = 0)
        {
            _c.Start("wss://test/ws", now);
            _t.ServerOpen();
            var auth = _t.Last("auth");
            Assert.AreEqual("jwt-token", (string)auth["token"]);
            _t.Answer(auth, new { user = new { uid = 100001 } });
            Assert.AreEqual(ConnectionState.Ready, _c.State);
        }

        [Test]
        public void AuthenticatesThenBecomesReady()
        {
            ConnectReady();
            Assert.AreEqual(100001, (int)_c.User["uid"]);
            Assert.AreEqual(0, _resynced, "first connection is not a resync");
        }

        [Test]
        public void RequestsAreRefusedUntilReadyAndNeverQueued()
        {
            RequestResult r = null;
            _c.Request("table.bet", new JObject(), x => r = x);
            Assert.AreEqual(RequestResult.NotConnected, r.ErrorCode);
            ConnectReady();
            Assert.AreEqual(0, _t.CountOf("table.bet"), "the refused bet was never sent later");
        }

        [Test]
        public void RequestResponseRoundTrip()
        {
            ConnectReady();
            RequestResult r = null;
            _c.Request("table.join", new JObject { ["tableId"] = "tx-1" }, x => r = x);
            _t.Answer(_t.Last("table.join"), new { round = new { seq = 1 } });
            Assert.IsTrue(r.Ok);
            Assert.AreEqual(1, (int)r.Data["round"]["seq"]);
        }

        [Test]
        public void DisconnectFailsPendingAsUnknownReconnectsAndResyncsWithoutResending()
        {
            ConnectReady();
            RequestResult bet = null;
            _c.Request("table.bet", new JObject { ["roundId"] = "r1" }, x => bet = x);
            _t.ServerClose(1006);
            Assert.IsTrue(bet.OutcomeUnknown);
            Assert.AreEqual(ConnectionState.WaitingToReconnect, _c.State);

            _c.Tick(400);
            Assert.AreEqual(1, _t.OpenCount, "back-off not elapsed yet");
            _c.Tick(500);
            Assert.AreEqual(2, _t.OpenCount);
            _t.ServerOpen();
            _t.Answer(_t.Last("auth"), new { user = new { uid = 100001 } });
            Assert.AreEqual(ConnectionState.Ready, _c.State);
            Assert.AreEqual(1, _resynced, "game code is told to re-join and re-read state");
            Assert.AreEqual(1, _t.CountOf("table.bet"), "the bet was NOT re-sent");
        }

        [Test]
        public void SessionExpiryStopsReconnecting()
        {
            ConnectReady();
            _t.ServerClose(4001);
            Assert.AreEqual(ConnectionState.SessionExpired, _c.State);
            _c.Tick(60000);
            Assert.AreEqual(1, _t.OpenCount);
        }

        [Test]
        public void RejectedAuthIsSessionExpiredAndMissingTokenNeverConnects()
        {
            _c.Start("wss://test/ws", 0);
            _t.ServerOpen();
            _t.Reject(_t.Last("auth"), "unauthorized");
            Assert.AreEqual(ConnectionState.SessionExpired, _c.State);

            var t2 = new FakeTransport();
            var c2 = new KeyoConnection(t2, () => null);
            c2.Start("wss://test/ws", 0);
            t2.ServerOpen();
            Assert.AreEqual(ConnectionState.SessionExpired, c2.State);
            Assert.AreEqual(0, t2.CountOf("auth"));
        }

        [Test]
        public void HeartbeatTimeoutDropsADeadSocketAndReconnects()
        {
            ConnectReady(0);
            _c.Tick(20000);
            var ping = _t.Last("ping");
            Assert.IsNotNull(ping, "heartbeat sent");
            _c.Tick(28000); // no answer within HeartbeatTimeoutMs
            Assert.AreEqual(ConnectionState.WaitingToReconnect, _c.State);
        }

        [Test]
        public void HeartbeatAnsweredKeepsTheConnection()
        {
            ConnectReady(0);
            _c.Tick(20000);
            _t.Answer(_t.Last("ping"), new { now = 1 });
            _c.Tick(30000);
            Assert.AreEqual(ConnectionState.Ready, _c.State);
            Assert.AreEqual(1, _t.CountOf("ping"));
        }

        [Test]
        public void ForegroundChecksAtOnceAndReconnectsImmediatelyWhenWaiting()
        {
            ConnectReady(0);
            _c.Tick(1000);
            _c.OnForeground();
            Assert.AreEqual(1, _t.CountOf("ping"), "resume probes the socket without waiting 20 s");
            _t.ServerClose(1006);
            Assert.AreEqual(ConnectionState.WaitingToReconnect, _c.State);
            _c.OnForeground();
            Assert.AreEqual(2, _t.OpenCount, "resume reconnects without waiting for the back-off");
        }

        [Test]
        public void EventsAreDeliveredOnlyWhenReady()
        {
            _c.Start("wss://test/ws", 0);
            _t.ServerOpen();
            _t.ServerSend(new { type = "event", @event = "wallet", data = new { balance = 1 } });
            Assert.AreEqual(0, _events.Count);
            _t.Answer(_t.Last("auth"), new { user = new { uid = 1 } });
            _t.ServerSend(new { type = "event", @event = "wallet", data = new { balance = 1 } });
            CollectionAssert.AreEqual(new[] { "wallet" }, _events);
        }

        [Test]
        public void StopIsFinal()
        {
            ConnectReady();
            _c.Stop();
            Assert.AreEqual(ConnectionState.Stopped, _c.State);
            _c.Tick(100000);
            Assert.AreEqual(1, _t.OpenCount);
        }
    }
}
