import React, {Component} from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TouchableHighlight
} from 'react-native';
import FirebaseClient from './FirebaseClient'
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';

var width = Dimensions.get('window').width;

class Item extends Component {

  constructor(props) {
    super(props);
    this.playSound = this.playSound.bind(this)
  }

  playSound() {
    // These timeouts are a hacky workaround for some issues with react-native-sound.
    // See https://github.com/zmxv/react-native-sound/issues/89.
    setTimeout(() => {

      var sound = new Sound(`${RNFS.DocumentDirectoryPath}/${this.props.item.name}`, '', (error) => {
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

  render() {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={this.playSound}>
          <Text style={styles.message}>Play {this.props.item.name}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: 70,
    width: width,
    marginRight: 20,
    backgroundColor: '#E9E9EF',
    justifyContent: 'center',
  },
  containerImage: {
    flex: 1,
    width: width,
    backgroundColor: '#E9E9EF',
    justifyContent: 'center',
  },
  message: {
    fontSize: 22,
    color: '#393e42',
    textAlign: 'left',
    margin: 10,
  },
  name: {
    fontSize: 12,
    color: '#393e42',
    textAlign: 'left',
    margin: 10,
  },
});

export default Item
