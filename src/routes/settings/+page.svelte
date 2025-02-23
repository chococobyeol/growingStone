<script lang="ts">
  import { goto } from '$app/navigation';
  import { setLanguage } from '$lib/i18n';
</script>

<div class="settings-container">
  <h1>Settings</h1>
  <p>설정 페이지 내용입니다.</p>
  <div class="language-settings">
    <h2>언어 설정</h2>
    <button on:click={() => setLanguage('en')}>English</button>
    <button on:click={() => setLanguage('ko')}>한국어</button>
  </div>
  <button on:click={() => goto('/')}>Back</button>
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
