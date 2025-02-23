<script lang="ts">
  import { goto } from '$app/navigation';
  import { setLanguage } from '$lib/i18n';
  import { t } from 'svelte-i18n';
</script>

<div class="settings-container">
  <h1>{$t('settings')}</h1>
  <p>{$t('settingsDescription')}</p>
  <div class="language-settings">
    <h2>{$t('languageSettings')}</h2>
    <button on:click={() => setLanguage('en')}>English</button>
    <button on:click={() => setLanguage('ko')}>한국어</button>
  </div>
  <button on:click={() => goto('/')}>{$t('backButton')}</button>
</div>

<style>
  .settings-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
    text-align: center;
  }
  .language-settings {
    margin: 1rem 0;
  }
  .language-settings button {
    margin: 0.5rem;
    padding: 0.5rem 1rem;
  }
</style>
