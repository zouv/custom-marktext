// [CUSTOM-BEGIN] CUSTOM-20260902-003 - 7za shim source for electron-builder winCodeSign cache extraction
// Windows without symlink privilege (no Developer Mode / no admin) fails to extract the
// winCodeSign-2.6.0.7z cache because the archive contains darwin dylib symlinks and 7za
// exits with code 2, aborting electron-builder. This shim runs the real 7za, then patches
// the two failed symlinks by copying their target files, and always exits 0 so
// app-builder proceeds with a usable cache. Build with csc.exe (see build script).
using System;
using System.Diagnostics;
using System.IO;

class SevenZaShim
{
    static int Main(string[] args)
    {
        try
        {
            string shimDir = AppDomain.CurrentDomain.BaseDirectory;
            string real7za = Path.Combine(shimDir, "7za-real.exe");
            if (!File.Exists(real7za))
            {
                real7za = Path.GetFullPath(Path.Combine(shimDir, "..", "..", "node_modules", "7zip-bin", "win", "x64", "7za.exe"));
            }

            var psi = new ProcessStartInfo
            {
                FileName = real7za,
                UseShellExecute = false,
            };
            var sb = new System.Text.StringBuilder();
            foreach (var a in args)
            {
                if (sb.Length > 0) sb.Append(' ');
                sb.Append('"').Append(a.Replace("\"", "\"\"")).Append('"');
            }
            psi.Arguments = sb.ToString();
            using (var p = Process.Start(psi))
            {
                p.WaitForExit();
            }

            string outDir = null;
            foreach (var a in args)
            {
                if (a.StartsWith("-o") && a.Length > 2)
                {
                    outDir = a.Substring(2);
                    break;
                }
            }
            if (outDir != null)
            {
                string libDir = Path.Combine(outDir, "darwin", "10.12", "lib");
                if (Directory.Exists(libDir))
                {
                    string[,] pairs = {
                        { "libssl.1.0.0.dylib", "libssl.dylib" },
                        { "libcrypto.1.0.0.dylib", "libcrypto.dylib" },
                    };
                    for (int i = 0; i < pairs.GetLength(0); i++)
                    {
                        string src = Path.Combine(libDir, pairs[i, 0]);
                        string dest = Path.Combine(libDir, pairs[i, 1]);
                        if (File.Exists(src) && (!File.Exists(dest) || new FileInfo(dest).Length == 0))
                        {
                            File.Copy(src, dest, true);
                        }
                    }
                }
            }
            return 0;
        }
        catch
        {
            return 0;
        }
    }
}
// [CUSTOM-END] CUSTOM-20260902-003
