<script lang="ts">
  import { onMount } from 'svelte';
  import { obliterate } from '$lib/vendor/orphan-obliterator/index.js';
  import '../lib/styles/global.css';

  let { children } = $props();

  onMount(() => {
    const orphans = obliterate('p, li, h2, h3');
    return () => orphans.destroy();
  });
</script>

{@render children()}
