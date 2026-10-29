Pod::Spec.new do |s|
  s.name           = 'StoreKitBridge'
  s.version        = '1.0.0'
  s.summary        = "DebateOwl's in-app subscriptions"
  s.description    = 'StoreKit 2 products, purchases, transactions and Apple subscription sheets for the DebateOwl app, called from JavaScript.'
  s.author         = ''
  s.homepage       = 'https://debateowl.com'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  # Swift 5 mode, as expo-store-review, so StoreKit's non-Sendable types cross the async functions without strict checks.
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
