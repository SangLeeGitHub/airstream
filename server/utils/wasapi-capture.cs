using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

// Minimal WASAPI Loopback Capture → stdout as PCM s16le
// Captures system audio even when speakers are muted
class WasapiLoopbackCapture
{
    // COM interfaces
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator {}

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
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
        int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        int GetBuffer(out IntPtr ppData, out uint pNumFramesToRead, out uint pdwFlags, out long pu64DevicePosition, out long pu64QPCPosition);
        int ReleaseBuffer(uint numFramesRead);
        int GetNextPacketSize(out uint pNumFramesInNextPacket);
    }

    const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    const int AUDCLNT_SHAREMODE_SHARED = 0;

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

    [StructLayout(LayoutKind.Sequential)]
    struct WAVEFORMATEXTENSIBLE
    {
        public WAVEFORMATEX Format;
        public ushort wValidBitsPerSample;
        public uint dwChannelMask;
        public Guid SubFormat;
    }

    static readonly Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
    static readonly Guid IID_IAudioCaptureClient = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
    static readonly Guid KSDATAFORMAT_SUBTYPE_IEEE_FLOAT = new Guid("00000003-0000-0010-8000-00aa00389b71");
    static readonly Guid KSDATAFORMAT_SUBTYPE_PCM = new Guid("00000001-0000-0010-8000-00aa00389b71");

    static void Main(string[] args)
    {
        int targetRate = 48000;
        int targetChannels = 2;

        if (args.Length >= 1) int.TryParse(args[0], out targetRate);
        if (args.Length >= 2) int.TryParse(args[1], out targetChannels);

        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice device;
        enumerator.GetDefaultAudioEndpoint(0 /* eRender */, 0 /* eConsole */, out device);

        object acObj;
        var iidAC = IID_IAudioClient;
        device.Activate(ref iidAC, 1, IntPtr.Zero, out acObj);
        var audioClient = (IAudioClient)acObj;

        IntPtr mixFormatPtr;
        audioClient.GetMixFormat(out mixFormatPtr);
        var mixFormat = Marshal.PtrToStructure<WAVEFORMATEX>(mixFormatPtr);

        int srcChannels = mixFormat.nChannels;
        int srcRate = (int)mixFormat.nSamplesPerSec;
        int srcBits = mixFormat.wBitsPerSample;
        // WASAPI shared mode always outputs IEEE float 32-bit
        bool isFloat = (srcBits == 32) || (mixFormat.wFormatTag == 3);

        if (mixFormat.cbSize >= 22)
        {
            var extFormat = Marshal.PtrToStructure<WAVEFORMATEXTENSIBLE>(mixFormatPtr);
            if (extFormat.SubFormat == KSDATAFORMAT_SUBTYPE_PCM && srcBits != 32)
            {
                isFloat = false;
            }
        }

        // Write format info to stderr so Node.js can read it
        Console.Error.WriteLine("FORMAT:" + srcRate + ":" + srcChannels + ":" + srcBits + ":" + (isFloat ? "float" : "pcm"));
        Console.Error.Flush();

        long hnsBufferDuration = 200000; // 20ms in 100ns units
        audioClient.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            hnsBufferDuration,
            0,
            mixFormatPtr,
            IntPtr.Zero
        );

        object ccObj;
        var iidCC = IID_IAudioCaptureClient;
        audioClient.GetService(ref iidCC, out ccObj);
        var captureClient = (IAudioCaptureClient)ccObj;

        audioClient.Start();

        var stdout = Console.OpenStandardOutput();
        var running = true;

        Console.CancelKeyPress += (s, e) => { running = false; e.Cancel = true; };

        while (running)
        {
            Thread.Sleep(10);

            uint packetSize;
            captureClient.GetNextPacketSize(out packetSize);

            while (packetSize > 0)
            {
                IntPtr dataPtr;
                uint numFrames;
                uint flags;
                long devPos, qpcPos;
                captureClient.GetBuffer(out dataPtr, out numFrames, out flags, out devPos, out qpcPos);

                if (numFrames > 0)
                {
                    int bytesPerFrame = srcChannels * (srcBits / 8);
                    int dataSize = (int)numFrames * bytesPerFrame;
                    byte[] rawData = new byte[dataSize];
                    Marshal.Copy(dataPtr, rawData, 0, dataSize);

                    // Convert to s16le output
                    int outFrames = (int)numFrames;
                    byte[] outData = new byte[outFrames * targetChannels * 2];

                    for (int i = 0; i < outFrames; i++)
                    {
                        for (int ch = 0; ch < targetChannels; ch++)
                        {
                            int srcCh = ch < srcChannels ? ch : 0;
                            short sample;

                            if (isFloat && srcBits == 32)
                            {
                                int offset = (i * srcChannels + srcCh) * 4;
                                float fSample = BitConverter.ToSingle(rawData, offset);
                                fSample = Math.Max(-1.0f, Math.Min(1.0f, fSample));
                                sample = (short)(fSample * 32767);
                            }
                            else if (srcBits == 16)
                            {
                                int offset = (i * srcChannels + srcCh) * 2;
                                sample = BitConverter.ToInt16(rawData, offset);
                            }
                            else if (srcBits == 24)
                            {
                                int offset = (i * srcChannels + srcCh) * 3;
                                int val = rawData[offset] | (rawData[offset + 1] << 8) | ((sbyte)rawData[offset + 2] << 16);
                                sample = (short)(val >> 8);
                            }
                            else if (srcBits == 32 && !isFloat)
                            {
                                int offset = (i * srcChannels + srcCh) * 4;
                                int val = BitConverter.ToInt32(rawData, offset);
                                sample = (short)(val >> 16);
                            }
                            else
                            {
                                sample = 0;
                            }

                            int outOffset = (i * targetChannels + ch) * 2;
                            outData[outOffset] = (byte)(sample & 0xFF);
                            outData[outOffset + 1] = (byte)((sample >> 8) & 0xFF);
                        }
                    }

                    try { stdout.Write(outData, 0, outData.Length); stdout.Flush(); }
                    catch { running = false; break; }
                }

                captureClient.ReleaseBuffer(numFrames);
                captureClient.GetNextPacketSize(out packetSize);
            }
        }

        audioClient.Stop();
    }
}
