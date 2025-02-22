<script lang="ts">
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';
  
    let email = '';
    let password = '';
    let errorMsg = '';
  
    async function handleLogin() {
      errorMsg = '';
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
  
      if (error) {
        errorMsg = error.message;
      } else {
        // 로그인 성공 시 게임 화면(루트 경로)으로 이동
        goto('/');
      }
    }
  </script>
  
  <h1>Login</h1>
  <label>
    Email:
    <input type="email" bind:value={email} />
  </label>
  <label>
    Password:
    <input type="password" bind:value={password} />
  </label>
  <button on:click|preventDefault={handleLogin}>Login</button>
  {#if errorMsg}
    <p style="color: red;">{errorMsg}</p>
  {/if}