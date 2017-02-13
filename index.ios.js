import React from 'react';
import { AppRegistry } from 'react-native';
import App from './src/App'

const soundboard = () => {
  return (
    <App />
  );
}

AppRegistry.registerComponent('soundboard', () => soundboard);
