$code = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

class WasapiCapture
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator {}

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate([In] ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        int Initialize(int shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr audioSessionGuid);
        int GetBufferSize(out uint pNumBufferFrames);
        int GetStreamLatency(out long phnsLatency);
        int GetCurrentPadding(out uint pNumPaddingFrames);
        int IsFormatSupported(int shareMode, IntPtr pFormat, out IntPtr ppClosestMatch);
        int GetMixFormat(out IntPtr ppDeviceFormat);
        int GetDevicePeriod(out long phnsDefaultDevicePeriod, out long phnsMinimumDevicePeriod);
        int Start();
        int Stop();
        int Reset();
        int SetEventHandle(IntPtr eventHandle);
        int GetService([In] ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        int GetBuffer(out IntPtr ppData, out uint pNumFramesToRead, out uint pdwFlags, out ulong pu64DevicePosition, out ulong pu64QPCPosition);
        int ReleaseBuffer(uint numFramesRead);
        int GetNextPacketSize(out uint pNumFramesInNextPacket);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;

    static void Main(string[] args)
    {
        int targetRate = args.Length > 0 ? int.Parse(args[0]) : 48000;
        int targetCh = args.Length > 1 ? int.Parse(args[1]) : 2;

        Stream stdout = Console.OpenStandardOutput();

        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice device;
        enumerator.GetDefaultAudioEndpoint(0, 0, out device);

        var iidAudioClient = typeof(IAudioClient).GUID;
        object obj;
        device.Activate(ref iidAudioClient, 0x17, IntPtr.Zero, out obj);
        var audioClient = (IAudioClient)obj;

        IntPtr mixFormatPtr;
        audioClient.GetMixFormat(out mixFormatPtr);
        var mixFormat = Marshal.PtrToStructure<WAVEFORMATEX>(mixFormatPtr);

        int srcChannels = mixFormat.nChannels;
        int srcRate = (int)mixFormat.nSamplesPerSec;
        int srcBits = mixFormat.wBitsPerSample;
        bool isFloat = (mixFormat.wFormatTag == 3) || (mixFormat.wFormatTag == 0xFFFE && srcBits == 32);

        Console.Error.WriteLine("FORMAT:" + srcRate + ":" + srcChannels + ":" + srcBits + ":" + (isFloat ? "float" : "pcm"));

        audioClient.Initialize(0, AUDCLNT_STREAMFLAGS_LOOPBACK, 10000000, 0, mixFormatPtr, IntPtr.Zero);
        Marshal.FreeCoTaskMem(mixFormatPtr);

        var iidCapture = typeof(IAudioCaptureClient).GUID;
        object captureObj;
        audioClient.GetService(ref iidCapture, out captureObj);
        var captureClient = (IAudioCaptureClient)captureObj;

        audioClient.Start();

        int srcFrameBytes = srcChannels * (srcBits / 8);
        byte[] outBuf = new byte[65536];

        // Silence frame to send when no audio is playing (keeps stream alive)
        int silenceFrames = (int)(targetRate * 0.01); // 10ms of silence
        int silenceBytes = silenceFrames * targetCh * 2;
        byte[] silenceBuf = new byte[silenceBytes];

        while (true)
        {
            Thread.Sleep(5);

            uint packetSize;
            captureClient.GetNextPacketSize(out packetSize);

            // If no packets, send silence to keep the stream alive
            if (packetSize == 0)
            {
                try
                {
                    stdout.Write(silenceBuf, 0, silenceBytes);
                    stdout.Flush();
                }
                catch { audioClient.Stop(); return; }
                continue;
            }

            while (packetSize > 0)
            {
                IntPtr dataPtr;
                uint numFrames;
                uint flags;
                ulong devPos, qpcPos;

                int hr = captureClient.GetBuffer(out dataPtr, out numFrames, out flags, out devPos, out qpcPos);
                if (hr != 0) break;

                bool isSilent = (flags & 0x2) != 0;
                int outBytes = (int)numFrames * targetCh * 2;

                if (outBytes > outBuf.Length)
                    outBuf = new byte[outBytes];

                if (isSilent)
                {
                    Array.Clear(outBuf, 0, outBytes);
                }
                else
                {
                    int dstOffset = 0;
                    for (int f = 0; f < (int)numFrames; f++)
                    {
                        int srcBase = f * srcFrameBytes;
                        for (int c = 0; c < targetCh && c < srcChannels; c++)
                        {
                            if (isFloat)
                            {
                                float val = BitConverter.ToSingle(GetBytes(dataPtr, srcBase + c * 4, 4), 0);
                                if (val > 1.0f) val = 1.0f;
                                if (val < -1.0f) val = -1.0f;
                                short s = (short)(val * 32767.0f);
                                outBuf[dstOffset] = (byte)(s & 0xFF);
                                outBuf[dstOffset + 1] = (byte)((s >> 8) & 0xFF);
                            }
                            else
                            {
                                int byteOff = srcBase + c * (srcBits / 8);
                                outBuf[dstOffset] = Marshal.ReadByte(dataPtr, byteOff + (srcBits / 8 - 2));
                                outBuf[dstOffset + 1] = Marshal.ReadByte(dataPtr, byteOff + (srcBits / 8 - 1));
                            }
                            dstOffset += 2;
                        }
                        for (int c = srcChannels; c < targetCh; c++)
                        {
                            outBuf[dstOffset] = 0;
                            outBuf[dstOffset + 1] = 0;
                            dstOffset += 2;
                        }
                    }
                }

                try
                {
                    stdout.Write(outBuf, 0, outBytes);
                    stdout.Flush();
                }
                catch
                {
                    audioClient.Stop();
                    return;
                }

                captureClient.ReleaseBuffer(numFrames);
                captureClient.GetNextPacketSize(out packetSize);
            }
        }
    }

    static byte[] GetBytes(IntPtr ptr, int offset, int count)
    {
        byte[] buf = new byte[count];
        Marshal.Copy(ptr + offset, buf, 0, count);
        return buf;
    }
}
"@

Add-Type -Language CSharp -OutputAssembly "c:\Users\lees3\source\AudioServer\server\utils\wasapi-capture.exe" -OutputType ConsoleApplication -TypeDefinition $code
Write-Host "Build complete"
