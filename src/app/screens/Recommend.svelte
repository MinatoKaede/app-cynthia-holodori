<script lang="ts">
  import { nav } from '../state.svelte';
  import Conditions from './Conditions.svelte';
  import Detail from './Detail.svelte';
  import Results from './Results.svelte';
</script>

{#if nav.view === 'conditions'}<Conditions />
{:else if nav.view === 'results'}<Results />
{:else}<Detail />{/if}
