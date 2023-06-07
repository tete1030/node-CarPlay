const fs = require("fs");
const { usb, findByIds } = require("usb");
const EventEmitter = require("events");
const VideoParser = require("./VideoParseWS");
const AudioParser = require("./AudioParse");
const MediaParse = require("./MediaParse");
const MessageHandler = require("./MessageHandler");
const Microphone = require("./Microphone");

class DongleHandler extends EventEmitter {
  constructor(
    {
      dpi = 160,
      nightMode = 0,
      hand = 0,
      boxName = "nodePlay",
      width = 800,
      height = 640,
      fps = 20,
    },
    videoData,
    audioData,
    mediaData
  ) {
    super();
    this._usb = usb;
    this._dpi = dpi;
    this._nightMode = nightMode;
    this._hand = hand;
    this._boxName = boxName;
    this._width = width;
    this._height = height;
    this._fps = fps;
    this._device = null;
    this._assets = [
      "other_link.hwfs",
      "adb",
      "adb.pub",
      "helloworld0",
      "helloworld1",
      "helloworld2",
      "libby265n.so",
      "libby265n_x86.so",
      "libscreencap40.so",
      "libscreencap41.so",
      "libscreencap43.so",
      "libscreencap50.so",
      "libscreencap50_x86.so",
      "libscreencap442.so",
      "libscreencap422.so",
      "mirrorcoper.apk",
      "libscreencap60.so",
      "libscreencap70.so",
      "libscreencap71.so",
      "libscreencap80.so",
      "libscreencap90.so",
      "libscreencap100.so",
      "HWTouch.dex",
    ];
    this._magic = "aa55aa55";
    this._magicBuff = Buffer.from(this._magic, "hex");
    this._state = 0;
    this._interface = null;
    this._inEP = null;
    this._outEP = null;
    this._mic = new Microphone();
    this._videoParser = new VideoParser(
      this._width,
      this._height,
      2000,
      "http://localhost:8081/supersecret",
      this.updateState,
      videoData
    );
    this._audioParser = new AudioParser(this.updateState, this._mic, audioData);
    this._mediaParser = new MediaParse(this.updateState, mediaData);
    this._messageHandler = new MessageHandler(
      this.updateState,
      this.setPlugged,
      this.quit
    );
    this._mic.on("data", (data) => {
      if (this._mic.active) {
        let audioData = Buffer.alloc(12);
        audioData.writeUInt32LE(5, 0);
        audioData.writeFloatLE(0.0, 4);
        audioData.writeUInt32LE(3, 8);
        this.serialise(Buffer.concat([audioData, data]), 7);
      }
    });
    this.plugged = false;
    this.time;
    this.enablePair = false;
    this.pairTimeout;
    this.lag = 0;
    this._keys = {
      invalid: 0, //'invalid',
      siri: 5, //'Siri Button',
      mic: 7, //'Car Microphone',
      boxMic: 15, //'Box Microphone',
      enableNightMode: 16, // night mode
      disableNightMode: 17, // disable night mode
      wifi5g: 25, //'5G Wifi',
      wifi2_4g: 24, //'2.4G Wifi',
      enableAudioTransfer: 22,
      disableAudioTransfer: 23,
      left: 100, //'Button Left',
      right: 101, //'Button Right',
      frame: 12,
      selectDown: 104, //'Button Select Down',
      selectUp: 105, //'Button Select Up',
      back: 106, //'Button Back',
      down: 114, //'Button Down',
      home: 200, //'Button Home',
      play: 201, //'Button Play',
      pause: 202, //'Button Pause',
      next: 204, //'Button Next Track',
      prev: 205, //'Button Prev Track',
      wifiEn: 1000,
      wifiPair: 1012,
      wifiConnect: 1002,
    };
    if (this.getDevice()) {
      console.log("device connected and ready");
    } else {
      console.log("device not connected");
    }

    setTimeout(() => {
      setInterval(() => {
        if (this.plugged) {
          this.sendKey("frame");
        }
      }, 1000);
    }, 15000);
  }

  measureLag(iteration) {
    const start = new Date();
    setTimeout(() => {
      this.lag = new Date() - start;
      //console.log("lag was: ", this.lag)
      this.measureLag(iteration + 1); // Recurse
    });
  }

  getDevice = () => {
    let device = findByIds(0x1314, 0x1520);
    if (!device) {
      device = findByIds(0x1314, 0x1521);
    }

    if (device) {
      this._device = device;
      this._device.open();
      this._device.reset(() => {});
      this._interface = this._device.interface(0);
      this._interface.claim();
      this._inEP = this._interface.endpoints[0];
      this._outEP = this._interface.endpoints[1];
      this._inEP.clearHalt((err) => {
        if (err) {
          console.log("Error clearing inendpoint halt");
          return false;
        } else {
          this._inEP.startPoll();
        }
      });
      this._outEP.clearHalt((err) => {
        if (err) {
          console.log("Error clearing outendpoint halt");
          return false;
        } else {
        }
      });
      this._inEP.on("data", (data) => {
        this.deSerialise(data);
      });
      this.startUp();
      return true;
    } else {
      console.log("Try find device")
      setTimeout(this.getDevice, 2000);
      return false;
    }
  };

  quit = () => {
    this.emit("quit");
  };

  sendTouch = (type, x, y) => {
    let msgType = 5;
    let action = type;
    let actionB = Buffer.alloc(4);
    let xB = Buffer.alloc(4);
    let yB = Buffer.alloc(4);
    let nothing = Buffer.alloc(4);
    actionB.writeUInt32LE(action);
    xB.writeUInt32LE(10000 * x);
    yB.writeUInt32LE(10000 * y);
    let message = [actionB, xB, yB, nothing];
    let messageB = Buffer.concat(message);
    this.serialise(messageB, msgType);
  };

  startUp = async () => {
    console.log("=======> sending dpi");
    await this.sendInt(this._dpi, "/tmp/screen_dpi");
    console.log("=======> sending android_work_mode");
    await this.sendInt(1, "/etc/android_work_mode");

    for (let i = 0; i < this._assets.length; i++) {
      console.log("=======> sending file", this._assets[i]);
      await this.readFile(this._assets[i]);
    }
        
    console.log("=======> sending g_open");
    await this.begin();

    await new Promise((r) => setTimeout(r, 2000));

    // send bluetoothAddress
    // send bluetooth pin code

    // Upload carplay.png
    // UploadLocalLogoPNGPublic
    // upload /etc/airplay.conf

    console.log("=======> sending night_mode");
    await this.sendInt(0, "/tmp/night_mode");
    console.log("=======> sending hand_drive_mode");
    await this.sendInt(0, "/tmp/hand_drive_mode");
    console.log("=======> sending charge_mode");
    await this.sendInt(1, "/tmp/charge_mode");
    // console.log("=======> sending verbose_mode");
    // await this.setVerbose(true);

    console.log("=======> sending bluetooth_name");
    await this.sendBTName("TCP BT")
    console.log("=======> sending wifi_name");
    await this.sendWifiName("TCP Wifi")

    console.log("=======> sending box_name");
    await this.sendString(this._boxName, "/etc/box_name");

    console.log("=======> sending mic_type");
    await this.sendMicType(1) // Use BoxMic
    console.log("=======> sending wifi_type");
    await this.sendWifiType(5)
    console.log("=======> sending audio_transfer_mode");
    await this.sendAudioTransferMode(false)
    console.log("=======> sending box_all_settings");
    await this.sendBoxAllSettings()

    setTimeout(() => {
      console.log("enabling wifi");
      this.sendKey("wifiEn");
      setTimeout(() => {
        console.log("auto connecting");
        this.sendKey("wifiConnect");
      }, 1000);
    }, 2000);
    this.pairTimeout = setTimeout(() => {
      console.log("no device, sending pair");
      this.sendKey("wifiPair");
    }, 15000);

    setInterval(() => {
      this.heartBeat();
    }, 2000);
  };

  begin = async () => {
    let width = Buffer.alloc(4);
    width.writeUInt32LE(this._width);
    let height = Buffer.alloc(4);
    height.writeUInt32LE(this._height);
    let fps = Buffer.alloc(4);
    fps.writeUInt32LE(this._fps);
    let format = Buffer.alloc(4);
    format.writeUInt32LE(5);
    let packetMax = Buffer.alloc(4);
    packetMax.writeUInt32LE(49152);
    let iBox = Buffer.alloc(4);
    iBox.writeUInt32LE(2);
    let phoneMode = Buffer.alloc(4);
    phoneMode.writeUInt32LE(2);
    let config = Buffer.concat([
      width,
      height,
      fps,
      format,
      packetMax,
      iBox,
      phoneMode,
    ]);
    await this.serialise(config, 1);
  };

  sendBTName = async (name) => {
    let buf = Buffer.from(name, 'utf-8');
    if (buf.length > 16) {
      console.error("BTName too long");
      return;
    }
    await this.serialise(buf, 13);
  }

  sendWifiName = async (name) => {
    let buf = Buffer.from(name, 'utf-8');
    if (buf.length > 16) {
      console.error("WifiName too long");
      return;
    }
    await this.serialise(buf, 14);
  }

  setVerbose = async (verbose) => {
    let msg = Buffer.alloc(4);
    msg.writeUInt32LE(verbose ? 1 : 0);
    await this.serialise(msg, 136);
  }

  sendMicType = async (type) =>{
    if (type == 1) {
      await this.sendKeyAsync("boxMic")
    } else if (type == 2) {
      console.error("unknown mic type")
    } else {
      await this.sendKeyAsync("mic")
    }
  }

  sendWifiType = async (type) => {
    if (type == 5) {
      await this.sendKeyAsync("wifi5g")
    } else {
      await this.sendKeyAsync("wifi2_4g")
    }
  }

  sendAudioTransferMode = async (mode) => {
    if (mode) {
      await this.sendKeyAsync("enableAudioTransfer")
    } else {
      await this.sendKeyAsync("disableAudioTransfer")
    }
  }

  sendBoxAllSettings = async () => {
    let settings = {
      syncTime: Math.round(Date.now() / 1000),
      mediaDelay: 300,
      androidAutoSizeW: this._width,
      androidAutoSizeH: this._height,
    }
    let buf = Buffer.from(JSON.stringify(settings))
    await this.serialise(buf, 25)
  }


  setPlugged = (state) => {
    this.plugged = state;
    clearTimeout(this.pairTimeout);
    this.emit("status", { status: this.plugged });
  };

  getPlugged() {
    return this.plugged;
  }

  sendInt = async (integer, fileName) => {
    let message = Buffer.alloc(4);
    message.writeUInt32LE(integer);
    await this.sendFile(message, fileName);
  };

  sendString = async (string, fileName) => {
    if (string.length > 16) {
      console.log("string too long");
    }
    let message = Buffer.from(string, "ascii");
    await this.sendFile(message, fileName);
  };

  sendFile = async (content, fileName) => {
    let msgType = 153;
    let newFileName = this.getFileName(fileName);
    let nameLength = this.getLength(newFileName);
    let contentLength = this.getLength(content);
    let message = [nameLength, newFileName, contentLength, content];
    let fullMessage = Buffer.concat(message);
    await this.serialise(fullMessage, msgType);
  };

  serialise = async (content, msgType) => {
    return new Promise((resolve) => {
      let dataLen = this.getLength(content);
      let type = Buffer.alloc(4);
      type.writeUInt32LE(msgType);
      let typeCheck = Buffer.alloc(4);
      typeCheck.writeUInt32LE(((msgType ^ -1) & 0xffffffff) >>> 0);
      let message = [this._magicBuff, dataLen, type, typeCheck];
      let msgBuff = Buffer.concat(message);

      new Promise((resolve2) => {
        this._outEP.transfer(msgBuff, (err) => {
          resolve2();
        });
      }).then(() => {
        this._outEP.transfer(content, (err) => {
          resolve();
        });
      });
    });
  };

  updateState = (state) => {
    // console.log("updating state")
    this._state = state;
  };

  deSerialise = (data) => {
    //console.log(data)
    let header = data.slice(0, 4);
    if (this._state === 0) {
      if (Buffer.compare(this._magicBuff, header) === 0) {
        let type = data[8];
        let duration = 0;
        if (type === 6) {
          // if(!(this.time)) {
          //     this.time = new Date().getTime()
          // } else {
          //     let now = new Date().getTime()
          //     duration = (now - this.time)// + this.lag
          //     this.time = now
          // }
          let length = data.readUInt32LE(4);
          this._videoParser.setActive(length);
        } else if (type === 7) {
          let length = data.readUInt32LE(4);
          if (length > 0) {
            this._audioParser.setActive(length);
          } else {
            console.error("empty audio packet")
          }
        } else if (type === 42) {
          let length = data.readUInt32LE(4);
          this._mediaParser.setActive(length);
        } else {
          let length = data.readUInt32LE(4);
          this._messageHandler.parseHeader(type, length, data);
        }
      }
    } else if (this._state === 6) {
      this._videoParser.addBytes(data);
    } else if (this._state === 7) {
      this._audioParser.addBytes(data);
    } else if (this._state === 42) {
      this._mediaParser.addBytes(data);
    } else {
      this._messageHandler.parseData(data);
    }
  };

  getLength = (data) => {
    let buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(Buffer.byteLength(data));
    return buffer;
  };

  getFileName = (name) => {
    return Buffer.from(name + "\0", "ascii");
  };

  readFile = async (path) => {
    let fullPath = "./assets/" + path;
    let size = fs.statSync(fullPath).size;
    let fileBuff = Buffer.alloc(size);

    let data = fs.readFileSync(fullPath);
    await this.sendFile(data, "/tmp/" + path);
  };

  heartBeat = () => {
    let msgType = 170;
    let message = Buffer.from("", "ascii");
    this.serialise(message, msgType);
  };

  sendKey = (action) => {
    if (this._keys[action] === undefined) {
      console.error("[Error] Unknown key: " +action)
      return;
    }
    let msg = Buffer.alloc(4);
    msg.writeUInt32LE(this._keys[action]);
    this.serialise(msg, 8);
  };

  sendKeyAsync = async (action) => {
    if (this._keys[action] === undefined) {
      console.error("[Error] Unknown key: " +action)
      return;
    }
    let msg = Buffer.alloc(4);
    msg.writeUInt32LE(this._keys[action]);
    await this.serialise(msg, 8);
  };
}

module.exports = DongleHandler;
