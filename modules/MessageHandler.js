const iconv = require('iconv-lite');

class MessageHandler {
    constructor(updateState, plugged, quit) {
        this.active = null;
        this.functions = {
            20: this.parse20,
            8: this.parse8,
            204: this.parse204,
            10: this.parse10,
            12: this.parse12,
            2: this.parse2,
            4: this.parse4,
            24: this.parse24,
            13: this.parse13,
            14: this.parse14,
            18: this.parse18,
            25: this.parse25,
            1: this.parse1,
	        0: this.parse0
        };
        this.update = updateState;
        this.bytesToRead = 0;
        this.bytesRead = 0;
        this.bytes = []
        this.plugged = plugged;
	this.quit = quit;
    }

    callFunction = (data) => {
        this.functions[this.active](data)
    }

    parseHeader = (type, length, data) => {
        if(this.functions.hasOwnProperty(type)) {
            this.update(type)
            this.active = type;
            this.bytesToRead = length;
            if(length === 0) {
                this.parseData({})
            }
            console.log("parsing type: ", type, " for length: ", length, data);
        } else {
            console.log("unkown type: ", type, " with data:: ", data)
        }
    }

    addBytes

    parseData = (data) => {
        this.callFunction(data)
    }

    parse20 = (data) => {
        let a = data.readUInt32LE(0)
        let b = data.readUInt32LE(4)
        console.log("manufacturer data: ", a, b)
        this.active = null;
        this.update(0)
    }

    parse8 = (data) => {
        let value = {
            0: 'invalid',
            5: 'Siri Button',
            6: 'Car Microphone',
            15: 'Box Ready',
            100: 'Button Left',
            101: 'Button Right',
            104: 'Button Select Down',
            105: 'Button Select Up',
            106: 'Button Back',
            114: 'Button Down',
            200: 'Button Home',
            201: 'Button Play',
            202: 'Button Pause',
            204: 'Button Next Track',
            205: 'Button Prev Track',
            1000: 'Support Wifi',
            1001: 'Support Auto Connect',
            1012: 'Support Wifi Need Ko'
        }
        let message = data.readUInt32LE(0)
        console.log("Carplay message: ", value[message])
        if(!(value[message])) {
            console.log("test message", data.toString('ascii'))
        }
        if(data.readUInt32LE() === 3) {
            this.quit()
        }
        this.update(0)
    }

    parse204 = (data) => {
        console.log("version number: ", data.toString('ascii'))
        this.update(0)
    }

    parse10 = (data) => {
        console.log("Bluetooth address: ", data.toString('ascii'))
        this.update(0)
    }

    parse12 = (data) => {
        console.log("Bluetooth Pin: ", data.toString('ascii'))
        this.update(0)
    }

    parse2 = (data) => {
        let wifi = Buffer.byteLength(data)
        if (wifi === 8) {
            let phoneType = data.readUInt32LE(0)
            let wifi = data.readUInt32LE(4)
            console.log("wifi avail, phone type: ", phoneType, " wifi: ", wifi)
        } else {
            let phoneType = data.readUInt32LE(0)
            console.log("no wifi avail, phone type: ", phoneType)
        }
        this.update(0)
        this.plugged(true)
    }

    parse4 = (data) => {
        console.log("sending unplugged event")
        this.plugged(false)
        this.update(0)
    }

    parse0 = (data) => {
        console.log(data)
        this.update(0)
    }

    parse24 = (data) => {
        let length = Buffer.byteLength(data)
        if (length >= 4) {
            let phoneType = data.readUInt32LE()
            let URL = iconv.decode(data.slice(4), "iso-8859-1")
            console.log("Received URL: ", URL)
        }
        this.update(0)
    }

    parse13 = (data) => {
        let length = Buffer.byteLength(data)
        if (length <= 16) {
            let content = iconv.decode(data.slice(0, length - 1), "UTF-8")
            console.log("Received Bluetooth Name: ", content)
        } else {
            console.log("Bluetooth name longer than 16")
        }
        this.update(0)
    }

    parse14 = (data) => {
        let length = Buffer.byteLength(data)
        if (length <= 16) {
            let content = iconv.decode(data.slice(0, length - 1), "UTF-8")
            console.log("Received Wifi Name: ", content)
        } else {
            console.log("Wifi name longer than 16")
        }
        this.update(0)
    }

    parse18 = (data) => {
        let length = Buffer.byteLength(data)
        let content = iconv.decode(data.slice(0, length - 1), "UTF-8")
        console.log("Received BT Pair List: ", content.split("\n").join(","))
        this.update(0)
    }

    parse25 = (data) => {
        let length = Buffer.byteLength(data)
        let content = iconv.decode(data, "iso-8859-1")
        console.log("Received Box Info: ", content)
        this.update(0)
    }

    parse1 = (data) => {
        if (data == null || data == {}) {
            console.error("No data");
        } else {
            let length = Buffer.byteLength(data)
            if (length == 28) {
                console.log("Open Success")
                let width = data.readUInt32LE(0)
                let height = data.readUInt32LE(4)
                let fps = data.readUInt32LE(8)
                let format = data.readUInt32LE(12)
                let packetMax = data.readUInt32LE(16)
                let iBox = data.readUInt32LE(20)
                let phoneMode = data.readUInt32LE(24)
                console.log(`${width}x${height}@${fps}fps format=${format} packetMax=${packetMax} iBox=${iBox} phoneMode=${phoneMode}`)
                if (width > 4000 || height > 4000 || fps > 60) {
                    if (iBox != 0) {
                        // if (androidWorkMode == 3 || phoneWorkMode == 3) sendAndroidWorkModeAssets
                        // if (!useCarMic) { sendMicType(micTypeFromPref) } else {  }
                        
                    } else {
                        // setUnauthorized
                        // EVT_BOX_VERSION_ERROR

                    }
                } else {
                    console.error("data exception!!!")
                }

            } else if (length != 0) {
                console.error("NULL!!!!!!")
            } else {
                console.error("Not a valid CMD_OPEN package, you should resend g_open")
            }
        }
        this.update(0)
    }
}

module.exports = MessageHandler;
