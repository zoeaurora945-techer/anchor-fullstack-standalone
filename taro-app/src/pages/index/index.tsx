import Taro, { getConfig } from '@tarojs/taro'
import React, { Component } from 'react'
import { View, Text } from '@tarojs/components'
import './index.scss'

export default class Index extends Component {
  state = {
    tasks: [] as any[],
    loading: false
  }

  componentDidMount() {
    this.loadTasks()
  }

  async loadTasks() {
    this.setState({ loading: true })
    try {
      const config = Taro.getAccountInfoSync()
      console.log('Account info:', config)
      // TODO: 接入云端同步接口
    } catch (e) {
      console.error('Failed to load tasks:', e)
    } finally {
      this.setState({ loading: false })
    }
  }

  render() {
    const { tasks, loading } = this.state
    return (
      <View className='index'>
        <Text className='title'>锚点小程序</Text>
        {loading ? (
          <Text>加载中...</Text>
        ) : (
          <View>
            {tasks.map((task: any) => (
              <View key={task.id} className='task-item'>
                <Text>{task.title}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    )
  }
}
