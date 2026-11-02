using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using KeyoGame.Games.Tables;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    /// <summary>The C# mirrors must equal the TypeScript source of truth (packages/shared).</summary>
    public class SharedRulesParityTests
    {
        private static string FindRepoFile(string relative)
        {
            var dir = new DirectoryInfo(TestContext.CurrentContext.TestDirectory);
            for (; dir != null; dir = dir.Parent)
            {
                var p = Path.Combine(dir.FullName, relative);
                if (File.Exists(p)) return p;
            }
            return null;
        }

        [Test]
        public void TaiXiuBetKindsEqualSharedTypeScript()
        {
            var path = FindRepoFile(Path.Combine("packages", "shared", "src", "games", "tables.ts"));
            if (path == null) Assert.Ignore("packages/shared not found from the test directory");
            var m = Regex.Match(File.ReadAllText(path), @"TAIXIU_BET_KINDS\s*=\s*\[([^\]]*)\]");
            Assert.IsTrue(m.Success, "TAIXIU_BET_KINDS not found");
            var ts = Regex.Matches(m.Groups[1].Value, "'([^']+)'").Cast<Match>().Select(x => x.Groups[1].Value).ToArray();
            CollectionAssert.AreEqual(ts, TaiXiuRules.BetKinds);
        }
    }
}
