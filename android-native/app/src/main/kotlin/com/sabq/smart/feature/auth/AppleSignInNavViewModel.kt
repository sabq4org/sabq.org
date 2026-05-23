package com.sabq.smart.feature.auth

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow

/**
 * Thin Hilt VM wrapper around the [PendingAppleSignIn] singleton so
 * the Compose layer can inject it via `hiltViewModel()` and observe
 * the [result] flow without depending on the data-layer singleton
 * directly. Same pattern as
 * [com.sabq.smart.data.push.PushNavViewModel]. Holds no state of its
 * own.
 */
@HiltViewModel
class AppleSignInNavViewModel @Inject constructor(
    val pending: PendingAppleSignIn,
) : ViewModel() {

    val result: StateFlow<PendingAppleSignIn.Result?> = pending.result

    fun consume() = pending.consume()
}
