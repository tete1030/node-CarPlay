const EventEmitter = require('events');
const spawn = require('child_process').spawn;

class AudioParse extends EventEmitter {
    constructor(updateState, mic, audioData) {
        super();
        this._mic = mic
        this.updateState = updateState;
        this.audioData = audioData
        this._bytesToRead = 0;
        this._bytesRead = [];
        this._bytesSize = 0;
        this._audioParse = true;
        this._navi = false;
        this._audioType = 1;
        this._naviPendingStop = false;
        this.type= null;
    }

    setActive = (bytesToRead) => {
        //console.log("sound active")
        if (bytesToRead > 0) {
            this._bytesToRead = bytesToRead
            if (bytesToRead < 16) {
                console.log("non-audio found")
                this._audioParse = false
            } else {
                this._audioParse = true
            }
            this.updateState(7)
        } else {
            console.error("empty audio packet")
        }
    }

    addBytes = (bytes) => {
        const typeMap = {
            1: 'AUDIO_OUTPUT_START:onNaviReportStart(audioType==2)',
            2: 'AUDIO_OUTPUT_STOP:onNaviReportStop(audioType==2)',
            4: 'onCallStart',
            5: 'onCallStop',
            6: 'onNaviReportStart',
            7: 'onNaviReportStop',
            8: 'onSiriStart',
            9: 'onSiriStop',
            10: 'onMediaStart',
            11: 'onMediaStop',
            12: 'AUDIO_ALERT_START:onNaviReportStart',
            13: 'AUDIO_ALERT_STOP:onNaviReportStop'
        }
        this._bytesRead.push(bytes)
        this._bytesSize += Buffer.byteLength(bytes)
        //console.log(this._bytesSize, this._bytesToRead)
        let type
        if (this._bytesSize === this._bytesToRead) {
            if (this._audioParse) {
                this.pipeData()
            } else {
                type = Buffer.concat(this._bytesRead)
                type = type.readInt8(12)
                this.type = type
                if (typeMap[type]) {
                    console.log("onAudioProcess:", typeMap[type])
                } else {
                    console.log("onAudioProcess:", type)
                }
                if (type === 6) {
                    // onNaviReportStart
                    console.log("setting audio to nav")
                    this._navi = true
                } else if (type === 7) {
                    // onNaviReportStop
                    console.log("setting audio to pending media")
                    this._naviPendingStop = true
                } else if (type === 2 && this._naviPendingStop) {
                    // AUDIO_OUTPUT_STOP
                    console.log("setting audio to media now")
                    this._navi = false
                    this._naviPendingStop = false
                } else if (type === 8 || type===4) {
                    // onSiriStart || onCallStart
                    this._mic.start()
                } else if (type === 9 || type===5) {
                    // onSiriStop || onCallStop
                    this._mic.stop()
                } else {
                    console.log("unknown audio type: ", type, this._naviPendingStop, this._navi)
                }
                this._bytesToRead = 0;
                this._bytesRead = [];
                this._bytesSize = 0;
                this.updateState(0);
            }
        }
    }
    pipeData = async() => {
        let fullData = Buffer.concat(this._bytesRead)
        let decodeType = fullData.readUInt32LE(0)
        let volume = fullData.readFloatLE(4)
        let audioType = fullData.readUInt32LE(8)
        let outputData = fullData.slice(12, this._bytesToRead)
        this.audioData({type: this.type, decode: decodeType, volume: volume, audioType: audioType, data: outputData})

        this._bytesToRead = 0;
        this._bytesRead = [];
        this._bytesSize = 0;
        this.updateState(0);
    }
}

module.exports = AudioParse;
