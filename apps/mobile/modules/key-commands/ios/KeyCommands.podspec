Pod::Spec.new do |s|
  s.name           = 'KeyCommands'
  s.version        = '1.0.0'
  s.summary        = "DebateOwl's iPad hardware-keyboard shortcuts"
  s.description    = 'UIKeyCommand shortcuts (⌘N, ⌘K, ⌘↩) for the DebateOwl app, set from JavaScript.'
  s.author         = ''
  s.homepage       = 'https://debateowl.com'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
