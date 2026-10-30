# Captures a window (even off-screen) with PrintWindow + PW_RENDERFULLCONTENT. Usage: snap.ps1 <hwnd> <out.png>
param([string]$Hwnd, [string]$Out)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public static class VoxSnap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static string Save(long hwnd, string path) {
    SetProcessDPIAware();
    RECT r; GetWindowRect(new IntPtr(hwnd), out r);
    int w = r.R - r.L, h = r.B - r.T;
    if (w <= 0 || h <= 0) return "empty";
    using (var bmp = new Bitmap(w, h)) {
      using (var g = Graphics.FromImage(bmp)) {
        IntPtr hdc = g.GetHdc();
        bool ok = PrintWindow(new IntPtr(hwnd), hdc, 2);
        g.ReleaseHdc(hdc);
        if (!ok) return "printwindow-failed";
      }
      bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
    }
    return "ok " + w + "x" + h;
  }
}
"@
[VoxSnap]::Save([long]$Hwnd, $Out)
