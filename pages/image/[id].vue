<template>
  <div class="container mx-auto p-4">
    <Head>
      <Title>Image {{ id }}</Title>
    </Head>
    <div v-if="imageError" class="text-red-500 text-center">
      Could not load image data.
    </div>
    <div v-else-if="!image" class="text-center">Loading image...</div>
    <div v-else>
      <div class="text-center mb-4">
        <NuxtLink to="/" class="text-blue-500 hover:underline"
          >&larr; Back to Gallery</NuxtLink
        >
      </div>
      <div class="flex justify-center">
        <img
          :src="`/api/raw/${id}`"
          :alt="`Image ${id}`"
          class="max-w-full max-h-[80vh] object-contain"
        />
      </div>
      <!-- Tagging UI will be re-added here if needed -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
// @ts-ignore
const useFetch: any = globalThis.useFetch || (await import('#app')).useFetch

const route = useRoute();
const id = Number(route.params.id);

const { data: image, error: imageError } = useFetch(`/api/images/${id}`);
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.text-center {
  text-align: center;
}

.mb-4 {
  margin-bottom: 1rem;
}

.max-w-full {
  max-width: 100%;
}

.max-h-[80vh] {
  max-height: 80vh;
}

.object-contain {
  object-fit: contain;
}

.text-blue-500 {
  color: #3b82f6;
}

.hover\:underline:hover {
  text-decoration: underline;
}

.text-red-500 {
  color: #ef4444;
}
</style>
