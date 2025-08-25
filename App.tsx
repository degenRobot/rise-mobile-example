import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import ExampleScreen from './src/screens/ExampleScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <>
      <StatusBar style="auto" />
      <NavigationContainer>
        <Tab.Navigator>
          <Tab.Screen 
            name="Example" 
            component={ExampleScreen}
            options={{
              tabBarLabel: 'Example',
              headerTitle: 'Porto Relay Example'
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}