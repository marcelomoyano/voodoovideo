import AVFoundation

class AudioEncoder {
    func encode(sampleBuffer: CMSampleBuffer) {
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        var lengthAtOffset: Int = 0
        var totalLength: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: &lengthAtOffset, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
        
        let length = totalLength

        if let dataPointer = dataPointer {
            let data = Data(bytes: dataPointer, count: length)
            // 🔥 Send this `data` directly via SRT or WHIP here
            print("🎧 Encoded Audio Frame: \(data.count) bytes")
        }
    }
}