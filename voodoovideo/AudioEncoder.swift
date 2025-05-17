import AVFoundation

class AudioEncoder {
    func encode(sampleBuffer: CMSampleBuffer) {
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        var length: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: &length, totalLengthOut: &length, dataPointerOut: &dataPointer)

        if let dataPointer = dataPointer {
            let data = Data(bytes: dataPointer, count: length)
            // 🔥 Send this `data` directly via SRT or WHIP here
            print("🎧 Encoded Audio Frame: \(data.count) bytes")
        }
    }
}