<script lang="ts">
    import { supabase } from '$lib/supabaseClient';
  
    let email = '';
    let password = '';
    let errorMsg = '';
  
    async function handleRegister() {
      errorMsg = '';
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
  
      if (error) {
        errorMsg = error.message;
      } else {
        // 회원가입 성공 처리 (예: 메인 페이지로 이동)
      }
    }
  </script>
  
  <h1>회원가입</h1>
  <label>
    Email:
    <input type="email" bind:value={email} />
  </label>
  <label>
    Password:
    <input type="password" bind:value={password} />
  </label>
  <button on:click|preventDefault={handleRegister}>Register</button>
  {#if errorMsg}
    <p style="color: red;">{errorMsg}</p>
  {/if}