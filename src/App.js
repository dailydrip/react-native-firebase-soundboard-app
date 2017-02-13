import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  TouchableHighlight,
  TouchableOpacity,
  Text,
  Platform,
  ActivityIndicator,
  ListView,
  PermissionsAndroid,
  Button,
  View
} from 'react-native';
import Sound from 'react-native-sound';
import RNFetchBlob from 'react-native-fetch-blob'
import FirebaseClient from './FirebaseClient'
import RNFS from 'react-native-fs';
import Item from './Item'

import {AudioRecorder, AudioUtils} from 'react-native-audio';
let audioPath = AudioUtils.DocumentDirectoryPath + '/test.aac';


// Prepare Blob support
const Blob = RNFetchBlob.polyfill.Blob
const fs = RNFetchBlob.fs
window.XMLHttpRequest = RNFetchBlob.polyfill.XMLHttpRequest
window.Blob = Blob


const list = []

export default class App extends Component {

  constructor(props) {
    super(props);

    this.ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2})

    this.state = {
      currentTime: 0.0,
      recording: false,
      stoppedRecording: false,
      finished: false,
      audioPath: AudioUtils.DocumentDirectoryPath + '/test.aac',
      hasPermission: undefined,
      loading: true,
      dataSource: this.ds.cloneWithRows(list),
    };

    this.itemsRef = this.getRef().child('sounds')
    this.record = this.record.bind(this)
    this.play = this.play.bind(this)
    this.stop = this.stop.bind(this)
    this.pause = this.pause.bind(this)
    this.finishRecording = this.finishRecording.bind(this)
    this.uploadSound = this.uploadSound.bind(this)
    this.sendAudioToFirebaseList = this.sendAudioToFirebaseList.bind(this)
  }

  getRef() {
    return FirebaseClient.database().ref();
  }

  setItemsFromFirebase(itemsRef) {
    itemsRef.on('value', (snap) => {

      // get children as an array
      var items = [];
      snap.forEach((child) => {
        items.push({
          url: child.val().url,
          name: child.val().name,
          _key: child.key
        });
      });

      for (var i = items.length - 1; i >= 0; i--) {
        RNFS.downloadFile({
          fromUrl: items[i].url,
          toFile: `${RNFS.DocumentDirectoryPath}/${items[i].name}`,
        }).promise.then((r) => {
          console.log('[downloaded]',  items[i].name, 'from url: ', items[i].url)
        });
      }

      this.setState({
        dataSource: this.ds.cloneWithRows(items),
        loading: false
      });
    });
  }

  renderItem(item) {
    return (
      <Item item={item} />
    )
  }

  componentDidMount() {

    this.setItemsFromFirebase(this.itemsRef);

    this.checkPermission().then((hasPermission) => {
      this.setState({ hasPermission });

      if (!hasPermission) return;

      this.prepareRecordingPath(this.state.audioPath);

      AudioRecorder.onProgress = (data) => {
        this.setState({currentTime: Math.floor(data.currentTime)});
      };

      AudioRecorder.onFinished = (data) => {
        // Android callback comes in the form of a promise instead.
        if (Platform.OS === 'ios') {
          this.finishRecording(data.status === "OK", data.audioFileURL);
        }
      };
    });
  }

  checkPermission() {
    if (Platform.OS !== 'android') {
      return Promise.resolve(true);
    }

    const rationale = {
      'title': 'Microphone Permission',
      'message': 'The app needs access to your microphone so you can record audio.'
    };

    return PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, rationale)
      .then((result) => {
        console.log('Permission result:', result);
        return (result === true || result === PermissionsAndroid.RESULTS.GRANTED);
      });
  }

  prepareRecordingPath(audioPath){
    AudioRecorder.prepareRecordingAtPath(audioPath, {
      SampleRate: 22050,
      Channels: 1,
      AudioQuality: "Low",
      AudioEncoding: "aac",
      AudioEncodingBitRate: 32000
    });
  }

  uploadSound(uri, mime = 'application/octet-stream') {
    return new Promise((resolve, reject) => {
      const uploadUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri
      let soundName = new Date().getTime().toString()
      let uploadBlob = null
      this.setState({ loading: true });

      const soundRef = FirebaseClient.storage().ref('sounds').child(soundName)

      fs.readFile(uploadUri, 'base64')
        .then((data) => {
          return Blob.build(data, { type: `${mime};BASE64` })
        })
        .then((blob) => {
          uploadBlob = blob
          return soundRef.put(blob, { contentType: mime })
        })
        .then(() => {
          uploadBlob.close()
          this.setState({uploadedFileName: soundName})
          return soundRef.getDownloadURL()
        })
        .then((url) => {
          resolve(url)
        })
        .catch((error) => {
          reject(error)
      })
    })
  }

  async record() {
    if (this.state.recording) {
      console.warn('Already recording!');
      return;
    }

    if (!this.state.hasPermission) {
      console.warn('Can\'t record, no permission granted!');
      return;
    }

    if(this.state.stoppedRecording){
      this.prepareRecordingPath(this.state.audioPath);
    }

    this.setState({recording: true});

    try {
      const filePath = await AudioRecorder.startRecording();
    } catch (error) {
      console.error(error);
    }
  }

  async play() {
    if (this.state.recording) {
      await this._stop();
    }

    // These timeouts are a hacky workaround for some issues with react-native-sound.
    // See https://github.com/zmxv/react-native-sound/issues/89.
    setTimeout(() => {
      var sound = new Sound(this.state.audioPath, '', (error) => {
        if (error) {
          console.log('failed to load the sound', error);
        }
      });

      setTimeout(() => {
        sound.play((success) => {
          if (success) {
            console.log('successfully finished playing');
          } else {
            console.log('playback failed due to audio decoding errors');
          }
        });
      }, 100);
    }, 100);
  }

  async pause() {
    if (!this.state.recording) {
      console.warn('Can\'t pause, not recording!');
      return;
    }

    this.setState({stoppedRecording: true, recording: false});

    try {
      const filePath = await AudioRecorder.pauseRecording();

      // Pause is currently equivalent to stop on Android.
      if (Platform.OS === 'android') {
        this.finishRecording(true, filePath);
      }
    } catch (error) {
      console.error(error);
    }
  }

  finishRecording(didSucceed, filePath) {
    this.setState({ loading: false });
    console.log(`Finished recording of duration ${this.state.currentTime} seconds at path: ${filePath}`);
    this.uploadSound(filePath)
      .then((url) => { this.sendAudioToFirebaseList(url) })
      .catch(error => console.log(error))
  }

  async stop() {
    if (!this.state.recording) {
      console.warn('Can\'t stop, not recording!');
      return;
    }

    this.setState({stoppedRecording: true, recording: false});

    try {
      const filePath = await AudioRecorder.stopRecording();

      if (Platform.OS === 'android') {
        this.finishRecording(true, filePath);
      }
      return filePath;
    } catch (error) {
      console.error(error);
    }
  }

  renderButton(title, onPress, active) {
    var style = (active) ? styles.activeButtonText : styles.buttonText;

    return (
      <TouchableHighlight style={styles.button} underlayColor='#F5FCFF' onPress={onPress}>
        <Text style={style}>
          { title }
        </Text>
      </TouchableHighlight>
    );
  }

  sendAudioToFirebaseList(url){
    FirebaseClient.database().ref('/sounds').push({url: url,name: this.state.uploadedFileName})
  }

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          soundboard app
        </Text>

        <ListView
            ref="list"
            onLayout={(event) => {
              var layout = event.nativeEvent.layout;

              this.setState({
                  listHeight : layout.height
              });
            }}
            renderFooter={() => {
                return <View onLayout={(event)=>{
                    var layout = event.nativeEvent.layout;
                    this.setState({
                        footerY : layout.y
                    });
                }}></View>
            }}
            dataSource={this.state.dataSource}
            renderRow={this.renderItem} />

        <ActivityIndicator animating={this.state.loading} size="large" />

        <View style={styles.controls}>
          {this.renderButton("RECORD ", () => {this.record()}, this.state.recording )}
          {this.renderButton(" PLAY ", () => {this.play()} )}
          {this.renderButton(" STOP ", () => {this.stop()} )}
          {this.renderButton(" PAUSE", () => {this.pause()} )}
        </View>
        <Text style={styles.progressText}>{this.state.currentTime}s</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  controls:{
    backgroundColor: '#F5FCFF',
    flexDirection: 'row'
  },
  buttonText: {
    fontSize: 20,
  },
  button: {
    borderRadius: 10,
    margin: 10,
    backgroundColor: '#9E9E9E',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
});

AppRegistry.registerComponent('soundboard', () => soundboard);
