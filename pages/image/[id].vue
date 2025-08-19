<template>
  <div>
    <NuxtLink to="/">← Back</NuxtLink>
    <div v-if="img">
      <h2>{{ img.filename }}</h2>
      <img :src="rawUrl" :alt="img.filename" style="max-width:100%;height:auto;" />
      <pre>{{ img.rel_path }}</pre>
      <section class="tags">
        <h3>Tags</h3>
        <div class="tag-list">
          <span v-for="t in tags" :key="t.id" class="tag">{{ t.name }}</span>
          <span v-if="tags.length===0" class="empty">(no tags)</span>
        </div>
        <form @submit.prevent="save">
          <input v-model="edit" placeholder="comma separated tags" />
          <button :disabled="saving">Save</button>
          <span v-if="savedMsg" class="msg">Saved</span>
        </form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
// @ts-ignore
const useFetch: any = globalThis.useFetch || (await import('#app')).useFetch

const route = useRoute()
const id = route.params.id as string
const { data: img }: any = await useFetch(`/api/images/${id}`)
const rawUrl = `/api/raw/${id}`

const tags = ref<any[]>([])
const edit = ref('')
const saving = ref(false)
const savedMsg = ref(false)

async function loadTags() {
  const { data }: any = await useFetch(`/api/images/${id}/tags`)
  if (data.value) {
    tags.value = data.value
    edit.value = data.value.map((r:any)=>r.name).join(', ')
  }
}

async function save() {
  saving.value = true
  try {
    const list = edit.value.split(',').map(s=>s.trim()).filter(Boolean)
    await useFetch(`/api/images/${id}/tags`, { method: 'PUT', body: { tags: list } })
    savedMsg.value = true
    setTimeout(()=> savedMsg.value = false, 1200)
    await loadTags()
  } finally {
    saving.value = false
  }
}

onMounted(loadTags)
</script>

<style scoped>
.tags { margin-top: 1rem; }
.tag-list { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }
.tag { background:#eef; padding:2px 6px; border-radius:4px; font-size:12px; }
.empty { color:#888; font-size:12px; }
form { display:flex; gap:6px; align-items:center; }
input { flex:1; }
.msg { color: green; font-size: 12px; }
</style>
