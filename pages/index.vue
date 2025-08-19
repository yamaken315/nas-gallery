<template>
  <main class="p">
    <h1>NAS Gallery</h1>
    <div class="grid">
      <div
        v-for="(image, index) in images"
        :key="image.id"
        class="aspect-square overflow-hidden cursor-pointer"
        @click="showLightbox(index)"
      >
        <img
          :src="`/api/thumb/${image.id}`"
          :alt="`Image ${image.id}`"
          class="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    </div>
    <div class="pager">
      <button @click="prev" :disabled="page===1">Prev</button>
      <span>{{ page }}</span>
      <button @click="next" :disabled="!hasMore">Next</button>
    </div>
    <VueEasyLightbox
      :visible="lightboxVisible"
      :imgs="lightboxImgs"
      :index="lightboxIndex"
      @hide="hideLightbox"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import VueEasyLightbox from "vue-easy-lightbox";

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

const totalPages = computed(() => {
  if (!total.value) return 1;
  return Math.ceil(total.value.count / limit);
});

const lightboxVisible = ref(false);
const lightboxIndex = ref(0);
const lightboxImgs = computed(() => {
  if (!images.value) return [];
  return images.value.map((img) => `/api/raw/${img.id}`);
});

function showLightbox(index: number) {
  lightboxIndex.value = index;
  lightboxVisible.value = true;
}

function hideLightbox() {
  lightboxVisible.value = false;
}

watch(page, () => {
  refresh();
  window.scrollTo(0, 0);
});
</script>

<style scoped>
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; }
img { width:100%; height:auto; object-fit:cover; border:1px solid #ccc; }
.pager { margin-top:12px; display:flex; gap:8px; align-items:center; }
</style>
