<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
</script>

<div class="page-coming-soon">
  <h1>{$t('market')}</h1>
  <p>{$t('comingSoon')}</p>
</div>

<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<style>
  .page-coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background-color: #f5f5f5;
    text-align: center;
  }
  h1 {
    margin-bottom: 1rem;
  }
  
  .back-btn {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #D7D4CD;
    color: #000;
    padding: 0.5rem 1rem;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    z-index: 1000;
    cursor: pointer;
  }
</style>
