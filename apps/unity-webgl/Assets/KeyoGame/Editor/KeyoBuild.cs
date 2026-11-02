using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace KeyoGame.EditorTools
{
    /// <summary>
    /// CI entry point (GameCI buildMethod): KeyoGame.EditorTools.KeyoBuild.BuildWebGL.
    /// Sets the WebGL player settings explicitly (so builds do not depend on hand-edited ProjectSettings)
    /// and writes a build report next to the output. Output: build/WebGL (or -customBuildPath).
    /// </summary>
    public static class KeyoBuild
    {
        private const string ScenePath = "Assets/Scenes/Main.unity";

        public static void BuildWebGL()
        {
            EnsureMainScene();

            PlayerSettings.companyName = "Keyo Game";
            PlayerSettings.productName = "Keyo Game HD";
            PlayerSettings.colorSpace = ColorSpace.Gamma; // widest WebGL/iOS compatibility, cheaper
            PlayerSettings.WebGL.template = "PROJECT:Keyo";
            // Brotli: smallest download; the host (Caddy/Nginx) must send Content-Encoding: br (see hosting/).
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.nameFilesAsHashes = true; // cache versioning: new build → new file names
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
            PlayerSettings.WebGL.powerPreference = WebGLPowerPreference.Default;
            PlayerSettings.WebGL.threadsSupport = false; // iOS WebKit: no SharedArrayBuffer without COOP/COEP
            PlayerSettings.WebGL.initialMemorySize = 64;  // MB; grows on demand
            PlayerSettings.WebGL.maximumMemorySize = 1024; // MB cap: iOS kills larger heaps
            PlayerSettings.WebGL.memoryGrowthMode = WebGLMemoryGrowthMode.Geometric;
            PlayerSettings.stripEngineCode = true;
            PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL, ManagedStrippingLevel.High);
            PlayerSettings.runInBackground = false; // do not render when hidden
            EditorUserBuildSettings.development = false;

            var output = GetArg("-customBuildPath") ?? Path.Combine("build", "WebGL");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            });
            WriteReport(report, output);
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError("[KeyoBuild] WebGL build failed: " + report.summary.result);
                if (Application.isBatchMode) EditorApplication.Exit(1);
            }
        }

        /// <summary>The game builds its UI from code; the build only needs one (empty) scene with a camera.</summary>
        private static void EnsureMainScene()
        {
            if (File.Exists(ScenePath)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = new GameObject("Main Camera", typeof(Camera)).GetComponent<Camera>();
            cam.tag = "MainCamera";
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.02f, 0.016f, 0.043f);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        private static void WriteReport(BuildReport report, string output)
        {
            try
            {
                Directory.CreateDirectory(output);
                var s = report.summary;
                var lines = new[]
                {
                    "result: " + s.result,
                    "totalSize: " + s.totalSize,
                    "totalTime: " + s.totalTime,
                    "errors: " + s.totalErrors,
                    "warnings: " + s.totalWarnings,
                    "files:",
                }.Concat(report.GetFiles().OrderByDescending(f => f.size).Take(30).Select(f => "  " + f.size + "  " + f.path));
                File.WriteAllLines(Path.Combine(output, "keyo-build-report.txt"), lines);
            }
            catch (Exception e) { Debug.LogWarning("[KeyoBuild] report failed: " + e.Message); }
        }

        private static string GetArg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return null;
        }
    }
}
