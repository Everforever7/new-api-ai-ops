<script setup>
const props = defineProps({
  visibleChannels: { type: Array, required: true },
  t: { type: Function, required: true },
  formatBalance: { type: Function, required: true },
  formatLatency: { type: Function, required: true }
})

function formatChannelStatus(channel) {
  if (channel.status === 1) return props.t('channelStatus.enabled')
  if (channel.status === 2) return props.t('channelStatus.autoDisabled')
  if (channel.status === 0) return props.t('channelStatus.disabled')
  return channel.statusLabel || props.t('channelStatus.unknown')
}

function channelStatusClass(channel) {
  if (channel.status === 1) return 'ok'
  if (channel.status === 2) return 'warn'
  return 'danger'
}
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ t('channels.title') }}</h2>
        <div class="status-pill warn">
          <div class="status-dot"></div>
          {{ visibleChannels.length }} {{ t('channels.title') }}
        </div>
      </div>
    </article>

    <article class="bento-item bento-full adaptive-bento">
       <div class="bento-body bento-table-wrap">
         <table>
           <thead>
             <tr>
               <th>{{ t('channels.id') }}</th>
               <th>{{ t('channels.name') }}</th>
               <th>{{ t('channels.status') }}</th>
               <th>{{ t('channels.balance') }}</th>
               <th>{{ t('channels.latency') }}</th>
             </tr>
           </thead>
           <tbody>
             <tr v-if="!visibleChannels.length">
               <td colspan="5" class="empty">{{ t('channels.empty') }}</td>
             </tr>
             <tr v-for="channel in visibleChannels" :key="channel.id">
               <td class="channel-id">{{ channel.id }}</td>
               <td>{{ channel.name }}</td>
               <td>
                 <span class="status-pill compact" :class="channelStatusClass(channel)">
                   <span class="status-dot"></span>
                   {{ formatChannelStatus(channel) }}
                 </span>
               </td>
               <td class="font-mono">{{ formatBalance(channel.balance) }}</td>
               <td class="font-mono">{{ formatLatency(channel.responseTimeMs) }}</td>
             </tr>
           </tbody>
         </table>
       </div>
    </article>
  </div>
</template>
