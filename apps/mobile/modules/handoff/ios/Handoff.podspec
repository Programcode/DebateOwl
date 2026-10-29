Pod::Spec.new do |s|
  s.name           = 'Handoff'
  s.version        = '1.0.0'
  s.summary        = "DebateOwl's Handoff activity"
  s.description    = 'Advertises the screen open in DebateOwl (NSUserActivity) so a Mac continues on debateowl.com and an iPad in the app.'
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
