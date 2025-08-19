<template>
  <main class="p">
    <h1>NAS Gallery</h1>
    <div class="grid">
      <NuxtLink v-for="img in images" :key="img.id" :to="`/image/${img.id}`">
        <img :src="`/api/thumb/${img.id}`" :alt="img.filename" loading="lazy" />
      </NuxtLink>
    </div>
    <div class="pager">
      <button @click="prev" :disabled="page===1">Prev</button>
      <span>{{ page }}</span>
      <button @click="next" :disabled="!hasMore">Next</button>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
// @ts-ignore
const useFetch: any = globalThis.useFetch || (await import('#app')).useFetch

const page = ref(1)
const images = ref<any[]>([])
async function load() {
  const { data }: any = await useFetch(`/api/images?page=${page.value}`)
  if (data.value) images.value = data.value.items
}
watch(page, load, { immediate: true })
const hasMore = computed(()=> images.value.length > 0)
function next(){ if(hasMore.value) page.value++ }
function prev(){ if(page.value>1) page.value-- }
</script>

<style scoped>
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; }
img { width:100%; height:auto; object-fit:cover; border:1px solid #ccc; }
.pager { margin-top:12px; display:flex; gap:8px; align-items:center; }
</style>
