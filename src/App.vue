<script setup lang="ts"></script>

<template>
  <!-- ключ по маршруту: при возврате из настроек экран собирается заново и перечитывает данные -->
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.path" />
  </RouterView>
</template>

<style>
@import './styles/global.css';
</style>
