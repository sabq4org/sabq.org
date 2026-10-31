package com.sabq.smart.data.api

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthHostScopeTest {
    @Test
    fun tokenOnlyForSabqApiHosts() {
        assertTrue("https://api.sabq.org/api/v1/editorial/me".toHttpUrl().isSabqApiHost())
        assertTrue("https://sabq.org/api/x".toHttpUrl().isSabqApiHost())
        assertFalse("https://media.sabq.org/news/a.webp".toHttpUrl().isSabqApiHost())
        assertFalse("https://attacker.example/a.jpg".toHttpUrl().isSabqApiHost())
        assertFalse("https://api.sabq.org.evil.com/a".toHttpUrl().isSabqApiHost())
        assertFalse("http://api.sabq.org/api/x".toHttpUrl().isSabqApiHost())
    }
}
